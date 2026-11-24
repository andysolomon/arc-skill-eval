import { Submodel } from 'foldkit';

import type { AppContext } from '@/app/context';
import { sx } from '@/ui/sx';

import type { Message } from '../message';
import type { Model } from '../model';
import { composerView } from './composer';
import { consoleView } from './console';
import { emptyStateView } from './emptyState';

// VIEW

export const view = Submodel.defineView<Model, Message, AppContext>((model, context, h) => {
  const isLocalhost = context.env === 'localhost';
  return h.main(
    [
      h.Class('app-main'),
      h.DataAttribute('env', context.env),
      h.DataAttribute('screen-label', `run (${context.env})`),
      h.DataAttribute('testid', 'run-app'),
      h.Style(
        sx(
          isLocalhost
            ? { display: 'flex', gap: 14, minHeight: 0, minWidth: 0, padding: 16 }
            : {
                alignItems: 'center',
                display: 'flex',
                justifyContent: 'center',
                minHeight: 0,
                minWidth: 0,
                padding: 40,
              },
        ),
      ),
    ],
    isLocalhost ? [composerView(model, context, h), consoleView(model, h)] : [emptyStateView(h)],
  );
});
