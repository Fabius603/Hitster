using System.Globalization;
using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Channels;
using Hitster.Recorder;

internal static class Program
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
    private static string Required(Dictionary<string,string> opts, string name) => opts.TryGetValue(name, out var value)
        ? value : throw new ArgumentException($"Option --{name} fehlt.");
    private static double Number(Dictionary<string,string> opts, string name) => double.Parse(Required(opts,name), CultureInfo.InvariantCulture);

    public static async Task<int> Main(string[] args)
    {
        try
        {
            if (args.Length == 0 || (args.Length-1)%2 != 0) throw new ArgumentException("Befehl und --option wert Paare erforderlich.");
            var opts = new Dictionary<string,string>();
            for (int i=1; i<args.Length; i+=2)
            {
                if (!args[i].StartsWith("--")) throw new ArgumentException("Option muss mit -- beginnen.");
                opts.Add(args[i][2..],args[i+1]);
            }
            switch(args[0])
            {
                case "devices": Console.WriteLine(JsonSerializer.Serialize(AudioService.Devices())); break;
                case "record": await Record(opts); break;
                case "session": await Session(opts); break;
                case "cut": Cut(opts); break;
                case "inspect":
                    var clip = AudioService.Inspect(Path.GetFullPath(Required(opts,"file")));
                    Console.WriteLine(JsonSerializer.Serialize(new {clip.Duration, Peak=clip.Peaks.Max()})); break;
                case "import":
                    var imported=Import(opts); Console.WriteLine(imported.Status+" "+imported.Id); break;
                case "import-batch":
                    var results=ImportBatch(opts); Console.WriteLine(JsonSerializer.Serialize(results));
                    return results.Any(r=>r.Status=="FAILED") ? 1 : 0;
                default: throw new ArgumentException("Unbekannter Befehl.");
            }
            return 0;
        }
        catch(Exception error) { Console.Error.WriteLine(error.Message); return 1; }
    }

    private static void Cut(Dictionary<string,string> opts)
    {
        var clip=AudioService.Inspect(Path.GetFullPath(Required(opts,"file")));
        clip.Start=Number(opts,"start"); clip.End=clip.Start+Number(opts,"length"); clip.Validate();
        var output=Path.GetFullPath(Required(opts,"out"));
        if (!output.EndsWith(".mp3",StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("Ausgabe benötigt .mp3.");
        Directory.CreateDirectory(Path.GetDirectoryName(output)!);
        using(var reservation=new FileStream(output,FileMode.CreateNew,FileAccess.Write,FileShare.None)) { }
        try { AudioService.ExportMp3(clip,output); }
        catch { File.Delete(output); throw; }
        Console.WriteLine(output);
    }

    private static async Task Record(Dictionary<string,string> opts)
    {
        var seconds = Number(opts,"seconds");
        if (!double.IsFinite(seconds) || seconds <= 1 || seconds > 600) throw new ArgumentException("Aufnahmedauer muss >1 und <=600 Sekunden sein.");
        var file = Path.GetFullPath(Required(opts,"out"));
        if (!file.EndsWith(".wav",StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("Rohaufnahme benötigt .wav.");
        Directory.CreateDirectory(Path.GetDirectoryName(file)!);
        // Exclusive reservation prevents accidental overwrite, including simultaneous starts.
        using(var reservation = new FileStream(file,FileMode.CreateNew,FileAccess.Write,FileShare.None)) { }
        var ready = file + ".ready";
        if (File.Exists(ready)) File.Delete(ready);
        using var audio = new AudioService();
        var stopped = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        ConsoleCancelEventHandler cancel = (_,e) => { e.Cancel=true; stopped.TrySetResult(true); };
        Console.CancelKeyPress += cancel;
        try
        {
            audio.Start(opts.GetValueOrDefault("device", ""),file);
            var completion = audio.RecordingTask!;
            File.WriteAllText(ready,DateTimeOffset.UtcNow.ToString("O"));
            Console.WriteLine("READY " + file); Console.Out.Flush();
            await Task.WhenAny(Task.Delay(TimeSpan.FromSeconds(seconds)), stopped.Task, completion);
            audio.Stop();
            await completion.WaitAsync(TimeSpan.FromSeconds(15));
            var clip = AudioService.Inspect(file);
            Console.WriteLine(JsonSerializer.Serialize(new {File=file,clip.Duration,Peak=clip.Peaks.Max()}));
        }
        finally { Console.CancelKeyPress -= cancel; if (File.Exists(ready)) File.Delete(ready); }
    }

    private sealed record ImportResult(int Entry, string Status, string? Id = null, string? Error = null);

    private static ImportResult[] ImportBatch(Dictionary<string,string> opts)
    {
        var project=Path.GetFullPath(Required(opts,"project"));
        var planPath=Path.GetFullPath(opts.GetValueOrDefault("plan",Path.Combine(project,".local/filmaufnahme/plan.json")));
        var entries=JsonNode.Parse(File.ReadAllText(planPath))!["entries"]!.AsArray();
        var selection=Required(opts,"entries");
        var wanted=new HashSet<int>();
        if(selection=="all") foreach(var e in entries) wanted.Add(e!["sourceId"]!.GetValue<int>());
        else foreach(var part in selection.Split(','))
        {
            var bounds=part.Split('-');
            if(bounds.Length>2) throw new ArgumentException("Ungültige Auswahl.");
            var first=int.Parse(bounds[0],CultureInfo.InvariantCulture);
            var last=bounds.Length==2 ? int.Parse(bounds[1],CultureInfo.InvariantCulture) : first;
            if(first<1 || last<first || last-first>10000) throw new ArgumentException("Ungültiger Eintragsbereich.");
            for(var i=first;i<=last;i++) wanted.Add(i);
        }
        var results=new List<ImportResult>();
        foreach(var id in wanted.Order())
        {
            try
            {
                var entry=entries.SingleOrDefault(e=>e!["sourceId"]!.GetValue<int>()==id)
                    ?? throw new InvalidDataException("Eintrag fehlt im Plan.");
                if(!string.IsNullOrWhiteSpace(entry["blocked"]?.GetValue<string>()))
                { results.Add(new(id,"BLOCKED",Error:entry["blocked"]!.GetValue<string>())); continue; }
                if(entry["de"]?["verified"]?.GetValue<bool>()!=true || entry["en"]?["verified"]?.GetValue<bool>()!=true)
                { results.Add(new(id,"PENDING")); continue; }
                var importOptions=new Dictionary<string,string>(opts) { ["plan"]=planPath,["entry"]=id.ToString(CultureInfo.InvariantCulture) };
                results.Add(Import(importOptions));
            }
            catch(Exception error) { results.Add(new(id,"FAILED",Error:error.Message)); }
        }
        return results.ToArray();
    }

    // One live process removes repeated CLI startup and the shell's ten-second yield per take.
    private static async Task Session(Dictionary<string,string> defaults)
    {
        var queue=Channel.CreateUnbounded<JsonObject>();
        void Reply(string status, object? data=null, string? requestId=null) =>
            Console.WriteLine(JsonSerializer.Serialize(new {status,requestId,data}));
        _=Task.Run(async()=>
        {
            string? line;
            while((line=await Console.In.ReadLineAsync())!=null)
            {
                try { await queue.Writer.WriteAsync(JsonNode.Parse(line) as JsonObject ?? throw new ArgumentException("JSON-Objekt erforderlich.")); }
                catch(Exception error) { Reply("error",error.Message); }
            }
            queue.Writer.TryWrite(new JsonObject { ["command"]="quit" });
        });
        using var audio=new AudioService();
        Task<string>? completion=null;
        string? file=null;
        int generation=0;
        async Task Stop(string? requestId)
        {
            if(completion==null) { Reply("idle",requestId:requestId); return; }
            try
            {
                audio.Stop(); await completion.WaitAsync(TimeSpan.FromSeconds(15));
                var clip=AudioService.Inspect(file!);
                Reply("recorded",new {file,clip.Duration,Peak=clip.Peaks.Max()},requestId);
            }
            catch(Exception error) { Reply("error",error.Message,requestId); }
            finally
            {
                if(file!=null && File.Exists(file+".ready")) File.Delete(file+".ready");
                completion=null; file=null; generation++;
            }
        }
        Reply("ready");
        await foreach(var message in queue.Reader.ReadAllAsync())
        {
            var requestId=message["requestId"]?.ToString();
            try
            {
                switch(message["command"]?.GetValue<string>())
                {
                    case "start":
                        if(completion!=null) throw new InvalidOperationException("Aufnahme läuft bereits.");
                        var seconds=message["seconds"]?.GetValue<double>() ?? 30;
                        if(!double.IsFinite(seconds) || seconds<=1 || seconds>600) throw new ArgumentException("Dauer muss >1 und <=600 Sekunden sein.");
                        var target=Path.GetFullPath(message["out"]!.GetValue<string>(),Path.GetFullPath(Required(defaults,"project")));
                        if(!target.EndsWith(".wav",StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("Ausgabe benötigt .wav.");
                        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                        using(var reservation=new FileStream(target,FileMode.CreateNew,FileAccess.Write,FileShare.None)) { }
                        audio.Start(message["device"]?.GetValue<string>() ?? "",target);
                        file=target; completion=audio.RecordingTask!;
                        var token=++generation;
                        File.WriteAllText(file+".ready",DateTimeOffset.UtcNow.ToString("O"));
                        Reply("recording",new {file,seconds},requestId);
                        _=Task.Run(async()=>
                        {
                            await Task.Delay(TimeSpan.FromSeconds(seconds));
                            queue.Writer.TryWrite(new JsonObject { ["command"]="stop",["generation"]=token });
                        });
                        break;
                    case "stop":
                        if(message["generation"] is JsonNode expected && expected.GetValue<int>()!=generation) break;
                        await Stop(requestId); break;
                    case "devices": Reply("devices",AudioService.Devices(),requestId); break;
                    case "quit":
                        if(completion!=null) await Stop(requestId);
                        queue.Writer.TryComplete(); Reply("bye",requestId:requestId); return;
                    default: throw new ArgumentException("Session-Befehl muss start, stop, devices oder quit sein.");
                }
            }
            catch(Exception error) { Reply("error",error.Message,requestId); }
        }
    }

    private static ImportResult Import(Dictionary<string,string> opts)
    {
        var project = Path.GetFullPath(Required(opts,"project"));
        var planPath = Path.GetFullPath(opts.GetValueOrDefault("plan", Path.Combine(project,".local/filmaufnahme/plan.json")));
        var plan = JsonNode.Parse(File.ReadAllText(planPath))!;
        if (plan["version"]?.GetValue<int>() != 1) throw new InvalidDataException("Unbekannte Planversion.");
        var id = int.Parse(Required(opts,"entry"),CultureInfo.InvariantCulture);
        var entry = plan["entries"]!.AsArray().Single(e=>e!["sourceId"]!.GetValue<int>()==id)!;
        if (!string.IsNullOrWhiteSpace(entry["blocked"]?.GetValue<string>())) throw new InvalidDataException("Eintrag ist blockiert.");
        var details = new CardDetails(entry["title"]!.GetValue<string>(),entry["year"]!.GetValue<int>(),
            entry["scene"]!.GetValue<string>(),entry["timestamp"]!.GetValue<string>());
        details.Validate(); CardStore.ValidateProject(project);
        // Serialize CLI imports (CardStore also locks against the desktop recorder).
        var lockDirectory = Path.Combine(project,".local/filmaufnahme");
        Directory.CreateDirectory(lockDirectory);
        using var importLock = new FileStream(Path.Combine(lockDirectory,"import.recorder.lock"),
            FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None,1,FileOptions.DeleteOnClose);
        var cards = JsonNode.Parse(File.ReadAllText(CardStore.CardFile(project)))!.AsArray();
        var existing = cards.FirstOrDefault(c=>c?["tracks"]?["de"] != null && c?["tracks"]?["en"] != null &&
            c?["answer"]?.Deserialize<CardDetails>(JsonOptions) == details);
        if (existing != null) return new(id,"EXISTS",existing["id"]!.GetValue<string>());
        AudioClip Track(string lang)
        {
            var track = entry[lang]!;
            if (track["verified"]?.GetValue<bool>() != true) throw new InvalidDataException($"{lang}: Sprache und Schnitt sind nicht geprüft.");
            var file = Path.GetFullPath(track["file"]!.GetValue<string>(),Path.GetDirectoryName(planPath)!);
            var clip = AudioService.Inspect(file);
            clip.Start = track["start"]!.GetValue<double>();
            clip.End = clip.Start + track["length"]!.GetValue<double>();
            clip.Validate();
            // Inspect only the selected region too, so a silent cut from a non-silent recording fails.
            using var reader = new NAudio.Wave.AudioFileReader(file);
            reader.CurrentTime = TimeSpan.FromSeconds(clip.Start);
            var buffer = new float[4096];
            var remaining = (long)(clip.Length * reader.WaveFormat.SampleRate) * reader.WaveFormat.Channels;
            float peak=0;
            while (remaining>0)
            {
                var read=reader.Read(buffer,0,(int)Math.Min(buffer.Length,remaining));
                if (read==0) throw new InvalidDataException("Ausschnitt endet nach der verfügbaren Aufnahme.");
                for(int i=0;i<read;i++) peak=Math.Max(peak,Math.Abs(buffer[i]));
                remaining-=read;
            }
            if (peak < 0.0001f) throw new InvalidDataException($"{lang}: Gewählter Ausschnitt ist stumm.");
            return clip;
        }
        var german=Track("de"); var english=Track("en");
        var cardId = CardStore.Save(project,details,german,english,AudioService.ExportMp3);
        return new(id,"SAVED",cardId);
    }
}
