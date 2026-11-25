#!/bin/bash
# Двойной клик — и NASstudy откроется в браузере на http://localhost:8091
# Gemini включится, если в файле .env указан GEMINI_API_KEY.
# Закрыть сайт: закрыть это окно Терминала (или нажать Ctrl+C).
cd "$(dirname "$0")"
( sleep 1.5; open "http://localhost:8091" ) &
exec /usr/bin/ruby server.rb
