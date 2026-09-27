; Start Willow after a successful interactive installation.
; The single-instance guard makes this safe if Willow is already running.
!macro NSIS_HOOK_POSTINSTALL
  IfSilent done
  ExecShell "open" "$INSTDIR\willow.exe"
  done:
!macroend
