import type { ReactNode } from 'react';
import { Panel } from './ui';

/** Placeholder body for modes that are not implemented yet. */
export function ModeStub({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Panel title={title} className="mode-stub">
      <p className="mode-stub__soon">Coming soon</p>
      {children && <div className="mode-stub__plan">{children}</div>}
    </Panel>
  );
}
