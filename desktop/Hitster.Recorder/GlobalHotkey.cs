using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Windows.Input;
using System.Windows.Interop;

namespace Hitster.Recorder;

public sealed class GlobalHotkey : IDisposable
{
    private const int Id = 0x4849;
    private readonly HwndSource source;
    public event Action? Pressed;
    public GlobalHotkey(IntPtr handle)
    {
        source = HwndSource.FromHwnd(handle)!;
        source.AddHook(Hook);
    }
    public void Register(RecorderSettings settings)
    {
        if (!Enum.TryParse<Key>(settings.HotkeyKey, out var key) || key == Key.None)
            throw new InvalidOperationException("Bitte eine gültige Hotkey-Taste auswählen.");
        uint modifiers = (settings.Alt ? 1u : 0) | (settings.Control ? 2u : 0) | (settings.Shift ? 4u : 0) | (settings.Windows ? 8u : 0);
        if (modifiers == 0) throw new InvalidOperationException("Bitte mindestens Strg, Alt, Umschalt oder Win für den Hotkey auswählen.");
        UnregisterHotKey(source.Handle, Id);
        if (!RegisterHotKey(source.Handle, Id, modifiers | 0x4000, (uint)KeyInterop.VirtualKeyFromKey(key)))
        {
            var error = Marshal.GetLastWin32Error();
            throw new Win32Exception(error, error == 1409
                ? "Der Hotkey ist bereits belegt. Bitte eine andere Kombination wählen."
                : $"Windows konnte den globalen Hotkey nicht registrieren (Fehler {error}).");
        }
    }
    private IntPtr Hook(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == 0x0312 && wParam.ToInt32() == Id) { handled = true; Pressed?.Invoke(); }
        return IntPtr.Zero;
    }
    public void Dispose() { UnregisterHotKey(source.Handle, Id); source.RemoveHook(Hook); }
    [DllImport("user32.dll", SetLastError = true)] private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint modifiers, uint key);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool UnregisterHotKey(IntPtr hWnd, int id);
}
