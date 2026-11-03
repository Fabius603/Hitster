"""Generate four original, deterministic cinematic demo sounds. Requires ffmpeg."""
import math, random, struct, subprocess, tempfile, wave
from pathlib import Path
random.seed(42)
ROOT = Path(__file__).resolve().parents[1]
RATE, SECONDS = 22050, 8
for kind in range(4):
    samples = []
    for i in range(RATE * SECONDS):
        t = i / RATE
        if kind == 0:
            signal = .35 * math.sin(2*math.pi*(180*t+45*t*t)) + .2 * math.sin(2*math.pi*55*t)
            signal *= .65+.35*math.sin(2*math.pi*3*t)
        elif kind == 1:
            pulse = (t % .8)
            signal = .7*math.sin(2*math.pi*65*t)*math.exp(-12*pulse)+.09*random.uniform(-1,1)*(t/SECONDS)
        elif kind == 2:
            notes = [261.63,329.63,392,523.25,392,523.25,659.25,783.99]
            f = notes[min(int(t),7)]
            signal = sum(math.sin(2*math.pi*f*n*t)/n for n in (1,2,3))*.28*min((t%1)*15,1)*math.exp(-1.7*(t%1))
        else:
            signal = 0
            for n,f in enumerate([523.25,622.25,783.99,987.77,739.99]):
                dt=t-n*1.1
                if dt>=0: signal += .24*math.exp(-1.8*dt)*(math.sin(2*math.pi*f*dt)+.35*math.sin(2*math.pi*f*2.73*dt))
        samples.append(signal*min(t/.1,1,(SECONDS-t)/.5))
    peak = max(abs(x) for x in samples)
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp)/'demo.wav'
        with wave.open(str(wav),'wb') as out:
            out.setparams((1,2,RATE,0,'NONE','not compressed'))
            out.writeframes(b''.join(struct.pack('<h',int(x/peak*26000)) for x in samples))
        subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(wav),'-codec:a','libmp3lame','-b:a','128k',str(ROOT/'variants'/'film'/'audio'/f'{kind+1:03}.mp3')],check=True)
