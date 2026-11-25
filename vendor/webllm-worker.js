/**
 * Фоновый поток для локальной нейросети (WebLLM).
 * Модель считает здесь, а не в основном потоке — интерфейс и анимация Юни
 * не подвисают, пока нейросеть думает.
 */
import { WebWorkerMLCEngineHandler } from './web-llm-0.2.89.js';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg) => handler.onmessage(msg);
