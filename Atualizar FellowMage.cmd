@echo off
rem Duplo clique para atualizar o FellowMage e, se houver versao nova, o XMage (sem clonar de novo).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\atualizar.ps1"
