!include "MUI2.nsh"

!define APPNAME "mcp-skill-tool"
!define COMPANY "mcp-skill-tool"
!define EXE_NAME "mcp-skill-tool.exe"
!define PRODUCT_VERSION "0.1.0"

Name "${APPNAME}"
OutFile "mcp-skill-tool-setup.exe"
InstallDir "$PROGRAMFILES64\\${COMPANY}\\${APPNAME}"
RequestExecutionLevel admin

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"
  File /oname=${EXE_NAME} "..\\..\\packaged\\mcp-skill-tool-windows-x64.exe"
  WriteUninstaller "$INSTDIR\\Uninstall.exe"
SectionEnd

Section /o "Add to PATH (System)"
  ; Optional: add install directory to system PATH
  ReadRegStr $0 HKLM "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment" "Path"
  StrCpy $1 "$0"
  ; Avoid duplicate: crude contains check
  StrCpy $2 "$1"
  Push "$INSTDIR"
  Push "$2"
  Call StrStr
  Pop $3
  StrCmp $3 "" +2 0
  Goto donePath
  StrCpy $1 "$1;$INSTDIR"
  WriteRegExpandStr HKLM "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment" "Path" "$1"
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
donePath:
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\\${EXE_NAME}"
  Delete "$INSTDIR\\Uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd

Function StrStr
  Exch $R1 ; haystack
  Exch
  Exch $R2 ; needle
  Push $R3
  Push $R4
  Push $R5
  StrLen $R3 $R2
  StrCpy $R4 0
loop:
  StrCpy $R5 $R1 $R3 $R4
  StrCmp $R5 $R2 found
  IntOp $R4 $R4 + 1
  StrCpy $R5 $R1 1 $R4
  StrCmp $R5 "" notfound
  Goto loop
found:
  StrCpy $R1 $R1 "" $R4
  Pop $R5
  Pop $R4
  Pop $R3
  Pop $R2
  Exch $R1
  Return
notfound:
  Pop $R5
  Pop $R4
  Pop $R3
  Pop $R2
  StrCpy $R1 ""
  Exch $R1
FunctionEnd
