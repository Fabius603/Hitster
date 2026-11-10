using System.Diagnostics;
using System.IO;
using System.Windows;
using Microsoft.Win32;

namespace Hitster.Recorder;

public partial class SettingsWindow : Window
{
    private readonly Action<RecorderSettings> apply;
    public SettingsWindow(RecorderSettings settings, Action<RecorderSettings> apply)
    {
        InitializeComponent(); this.apply = apply;
        Ctrl.IsChecked = settings.Control; Alt.IsChecked = settings.Alt;
        Shift.IsChecked = settings.Shift; Win.IsChecked = settings.Windows;
        Hotkey.ItemsSource = Enumerable.Range(1, 24).Select(n => "F" + n).Concat(Enumerable.Range('A', 26).Select(n => ((char)n).ToString())).ToArray();
        Hotkey.SelectedItem = settings.HotkeyKey;
        Project.Text = settings.ProjectPath;
        try
        {
            var devices = AudioService.Devices();
            if (!devices.Any(d => d.Id == settings.DeviceId))
            {
                devices.Add(new OutputDevice(settings.DeviceId, "Bisheriges Gerät nicht verfügbar – bitte neu auswählen"));
                Error.Text = "Das gespeicherte Ausgabegerät ist nicht verbunden.";
            }
            Device.ItemsSource = devices; Device.SelectedValue = settings.DeviceId;
        }
        catch (Exception error) { Error.Text = "Audiogeräte konnten nicht geladen werden: " + error.Message; }
    }
    private void Browse_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFolderDialog { Title = "Hitster-Projektordner auswählen", Multiselect = false };
        if (dialog.ShowDialog(this) == true) Project.Text = dialog.FolderName;
    }
    private void Save_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            CardStore.ValidateProject(Project.Text.Trim());
            if (Hotkey.SelectedItem is not string key || Device.SelectedItem is not OutputDevice device)
                throw new InvalidOperationException("Bitte Hotkey und Ausgabegerät auswählen.");
            if (!AudioService.Devices().Any(d => d.Id == device.Id)) throw new InvalidOperationException("Das Ausgabegerät ist nicht mehr verfügbar.");
            apply(new RecorderSettings
            {
                ProjectPath = Path.GetFullPath(Project.Text.Trim()), DeviceId = device.Id,
                HotkeyKey = key, Control = Ctrl.IsChecked == true, Alt = Alt.IsChecked == true,
                Shift = Shift.IsChecked == true, Windows = Win.IsChecked == true
            });
            DialogResult = true;
        }
        catch (Exception error) { Error.Text = error.Message; }
    }
    private void OpenRecordings_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var folder = Path.Combine(RecorderSettings.DataDirectory, "recordings");
            Directory.CreateDirectory(folder);
            Process.Start(new ProcessStartInfo("explorer.exe", folder) { UseShellExecute = true });
        }
        catch (Exception error) { Error.Text = error.Message; }
    }
}
