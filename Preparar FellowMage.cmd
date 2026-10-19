@echo off
rem Duplo clique na primeira vez: baixa e compila o XMage e instala as dependencias do cliente web.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\preparar.ps1"
