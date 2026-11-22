import { Clock, Duration, Effect, Option, Queue, Schema, Stream } from 'effect';
import { Subscription } from 'foldkit';

import { isRunning } from './lifecycle';
import { Message } from './message';
import type { Model } from './model';
import { parseRunEvent, type RunEvent } from './runEvent';

const SPINNER_INTERVAL = Duration.millis(100);
const SOCKET_RECONNECT_DELAY = Duration.seconds(1);

// RUN SOCKET

/** One connection's frames; ends when the socket closes. */
const socketEvents = (url: string): Stream.Stream<RunEvent> =>
  Stream.callback<RunEvent>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const handleMessage = (event: MessageEvent) => {
          if (typeof event.data !== 'string') {
            return;
          }
          Option.match(parseRunEvent(event.data), {
            onNone: () => undefined,
            onSome: (runEvent) => Queue.offerUnsafe(queue, runEvent),
          });
        };
        const handleClose = () => {
          Queue.endUnsafe(queue);
        };
        try {
          const socket = new WebSocket(url);
          socket.addEventListener('message', handleMessage);
          socket.addEventListener('close', handleClose);
          return Option.some(socket);
        } catch {
          handleClose();
          return Option.none<WebSocket>();
        }
      }),
      (maybeSocket) =>
        Effect.sync(() =>
          Option.match(maybeSocket, {
            onNone: () => undefined,
            onSome: (socket) => socket.close(),
          }),
        ),
    ).pipe(Effect.flatMap(() => Effect.never)),
  );

/**
 * Frames from the run's socket, reconnecting a second after it drops. The
 * subscription ends (closing the socket) once the run is done or cancelled.
 */
const runSocketMessages = (url: string): Stream.Stream<Message> =>
  Stream.concat(socketEvents(url), Stream.fromEffectDrain(Effect.sleep(SOCKET_RECONNECT_DELAY))).pipe(
    Stream.forever,
    Stream.mapEffect((event) =>
      Clock.currentTimeMillis.pipe(Effect.map((receivedAtMs) => Message.ReceivedRunEvent({ event, receivedAtMs }))),
    ),
  );

// SUBSCRIPTION

export const subscriptions = Subscription.make<Model, Message>()((entry) => ({
  runSpinner: entry(
    { isRunning: Schema.Boolean },
    {
      modelToDependencies: (model) => ({ isRunning: isRunning(model.run) }),
      dependenciesToStream: ({ isRunning: isActive }) =>
        isActive
          ? Stream.tick(SPINNER_INTERVAL).pipe(
              Stream.drop(1),
              Stream.map(() => Message.TickedSpinner()),
            )
          : Stream.empty,
    },
  ),
  runSocket: entry(
    { maybeSocketUrl: Schema.Option(Schema.String) },
    {
      modelToDependencies: (model) => ({
        maybeSocketUrl: model.run._tag === 'Streaming' ? Option.some(model.run.socketUrl) : Option.none(),
      }),
      dependenciesToStream: ({ maybeSocketUrl }) =>
        Option.match(maybeSocketUrl, {
          onNone: (): Stream.Stream<Message> => Stream.empty,
          onSome: runSocketMessages,
        }),
    },
  ),
}));
