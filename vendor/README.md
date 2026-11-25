# vendor

- `web-llm-0.2.89.js` — библиотека [WebLLM](https://github.com/mlc-ai/web-llm) (лицензия Apache-2.0), сборка ESM с jsDelivr
  (`https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.89/+esm`). Лежит в проекте, чтобы нейросеть работала без интернета
  и не зависела от CDN. Обновление: скачать новую версию по той же ссылке и поменять номер в `src/engine/localllm.js`
  и `vendor/webllm-worker.js`.
- `webllm-worker.js` — фоновый поток, в котором считает модель.
