Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "s:\Git\cmcreader-exe"
WshShell.Run "cmd.exe /c start-service.cmd", 0, False
