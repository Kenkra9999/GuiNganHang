Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
currentDir = FSO.GetParentFolderName(WScript.ScriptFullName)
psScript = currentDir & "\scripts\launch.ps1"

command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & psScript & """"
WshShell.Run command, 0, False
