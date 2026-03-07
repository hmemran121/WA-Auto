/**
 * schedulerBus.js — Shared EventEmitter bridge for Scheduler ↔ Server
 * 
 * Problem: scheduler.js runs server-side and uses `io` (Socket.IO server).
 * io.on() does NOT receive events emitted by clients (like whatsapp-service.js).
 * Solution: a plain Node.js EventEmitter that both server.js and scheduler.js
 * can import. server.js emits here when it receives WA send results.
 * scheduler.js listens here in sendWithAck() to know real success/failure.
 */

'use strict';

const { EventEmitter } = require('events');

const schedulerBus = new EventEmitter();
schedulerBus.setMaxListeners(200); // allow many concurrent sends

module.exports = schedulerBus;
