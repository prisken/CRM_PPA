'use client';

import { memo } from 'react';
import ClientStrategyMapNode from '@/components/clients/ClientStrategyMapNode';
import type { ClientStrategyMapNode as ClientStrategyMapNodeModel } from '@/lib/clientStrategyReportHelpers';

type ClientStrategyMapProps = {
  nodes: ClientStrategyMapNodeModel[];
  hasMilestones?: boolean;
};

function MapConnector({ orientation }: { orientation: 'horizontal' | 'vertical' }) {
  if (orientation === 'vertical') {
    return (
      <div
        className="flex justify-center py-1.5 print:py-1"
        aria-hidden="true"
      >
        <div className="flex flex-col items-center text-gray-300">
          <span className="h-4 w-px bg-current" />
          <span className="text-[10px] leading-none text-gray-400">▼</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex shrink-0 items-center self-center px-1.5 print:hidden"
      aria-hidden="true"
    >
      <span className="h-px w-4 bg-gray-300" />
      <span className="text-[10px] leading-none text-gray-400">▶</span>
    </div>
  );
}

function MilestonePlaceholder() {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/80 px-4 py-5 text-center print:break-inside-avoid">
      <p className="text-sm font-medium text-gray-700">
        Milestones not added yet
      </p>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">
        When your advisor adds selected years or scenarios, they will appear
        here between your goal and expected outcome.
      </p>
    </div>
  );
}

function renderNodeList(
  nodes: ClientStrategyMapNodeModel[],
  hasMilestones: boolean,
  orientation: 'horizontal' | 'vertical'
) {
  const goalNode = nodes[0];
  const outcomeNode = nodes[nodes.length - 1];
  const milestoneNodes =
    nodes.length > 2 ? nodes.slice(1, -1) : ([] as ClientStrategyMapNodeModel[]);

  const items: Array<
    | { type: 'node'; node: ClientStrategyMapNodeModel; step: number }
    | { type: 'placeholder' }
  > = [];

  if (goalNode) {
    items.push({ type: 'node', node: goalNode, step: 1 });
  }

  if (!hasMilestones) {
    items.push({ type: 'placeholder' });
  } else {
    milestoneNodes.forEach((node, index) => {
      items.push({ type: 'node', node, step: index + 2 });
    });
  }

  if (outcomeNode && nodes.length > 1) {
    items.push({
      type: 'node',
      node: outcomeNode,
      step: hasMilestones ? milestoneNodes.length + 2 : 2,
    });
  }

  return items.map((item, index) => (
    <li
      key={
        item.type === 'node'
          ? item.node.id
          : 'milestone-placeholder'
      }
      className={
        orientation === 'vertical'
          ? 'flex flex-col'
          : 'flex max-w-full items-stretch'
      }
    >
      {item.type === 'placeholder' ? (
        <MilestonePlaceholder />
      ) : (
        <div
          className={
            orientation === 'horizontal'
              ? 'w-[17.5rem] max-w-[calc(100vw-3rem)] shrink-0'
              : 'w-full'
          }
        >
          <ClientStrategyMapNode node={item.node} stepLabel={item.step} />
        </div>
      )}
      {index < items.length - 1 ? (
        <MapConnector orientation={orientation} />
      ) : null}
    </li>
  ));
}

function ClientStrategyMap({
  nodes,
  hasMilestones = true,
}: ClientStrategyMapProps) {
  if (nodes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500">
        Strategy journey map is not available for this plan yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-gray-500">
        Follow the steps below from goal to outcome. Only advisor-selected
        milestones are shown—missing years are not filled in automatically.
      </p>

      {/* Mobile / print: vertical spine */}
      <ol
        aria-label="Strategy journey map"
        className="flex flex-col gap-0 md:hidden print:flex"
      >
        {renderNodeList(nodes, hasMilestones, 'vertical')}
      </ol>

      {/* Desktop screen: horizontal wrapping flow (hidden when printing) */}
      <ol
        aria-label="Strategy journey map"
        className="hidden flex-wrap items-stretch gap-y-3 md:flex print:hidden"
      >
        {renderNodeList(nodes, hasMilestones, 'horizontal')}
      </ol>
    </div>
  );
}

export default memo(ClientStrategyMap);
