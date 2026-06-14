"use client";

import {
  ClientCard,
  PIPELINE_COLUMNS,
  PipelineColumnId,
  getClientName,
} from "@/lib/pipeline";
import {
  DragDropContext,
  Draggable,
  Droppable,
  DropResult,
} from "@hello-pangea/dnd";
import { Circle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type ColumnState = Record<PipelineColumnId, ClientCard[]>;

function buildColumnState(clients: ClientCard[]): ColumnState {
  const columns = PIPELINE_COLUMNS.reduce<ColumnState>((acc, column) => {
    acc[column.id] = [];
    return acc;
  }, {} as ColumnState);

  for (const client of clients) {
    columns[client.status]?.push(client);
  }

  return columns;
}

export default function KanbanBoard() {
  const [columns, setColumns] = useState<ColumnState>(() =>
    buildColumnState([]),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClients = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/clients");

      if (!response.ok) {
        throw new Error("Failed to load clients");
      }

      const clients: ClientCard[] = await response.json();
      setColumns(buildColumnState(clients));
    } catch {
      setError("Unable to load pipeline clients.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  async function handleDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result;

    if (!destination) {
      return;
    }

    const sourceColumnId = source.droppableId as PipelineColumnId;
    const destinationColumnId = destination.droppableId as PipelineColumnId;

    if (
      sourceColumnId === destinationColumnId &&
      source.index === destination.index
    ) {
      return;
    }

    const sourceClients = [...columns[sourceColumnId]];
    const [movedClient] = sourceClients.splice(source.index, 1);

    if (!movedClient) {
      return;
    }

    const destinationClients =
      sourceColumnId === destinationColumnId
        ? sourceClients
        : [...columns[destinationColumnId]];

    const updatedClient: ClientCard =
      sourceColumnId === destinationColumnId
        ? movedClient
        : {
            ...movedClient,
            status: destinationColumnId,
            pendingNotifications: true,
          };

    destinationClients.splice(destination.index, 0, updatedClient);

    setColumns((prev) => ({
      ...prev,
      [sourceColumnId]:
        sourceColumnId === destinationColumnId
          ? destinationClients
          : sourceClients,
      ...(sourceColumnId !== destinationColumnId && {
        [destinationColumnId]: destinationClients,
      }),
    }));

    if (sourceColumnId !== destinationColumnId) {
      try {
        const response = await fetch(`/api/clients/${draggableId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: destinationColumnId }),
        });

        if (!response.ok) {
          throw new Error("Failed to update client");
        }

        const savedClient: ClientCard = await response.json();

        setColumns((prev) => ({
          ...prev,
          [destinationColumnId]: prev[destinationColumnId].map((client) =>
            client.id === savedClient.id ? savedClient : client,
          ),
        }));
      } catch {
        setError("Failed to update client status. Reverting changes.");
        fetchClients();
      }
    }
  }

  if (isLoading) {
    return (
      <p className="text-sm text-content-secondary">Loading pipeline...</p>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-white p-6 shadow-card">
        <p className="text-sm text-red-600">{error}</p>
        <button
          type="button"
          onClick={fetchClients}
          className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        {PIPELINE_COLUMNS.map((column) => (
          <div key={column.id} className="flex min-h-[32rem] flex-col">
            <div className="mb-3 flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold text-content">
                {column.title}
              </h2>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-content-muted shadow-soft">
                {columns[column.id].length}
              </span>
            </div>

            <Droppable droppableId={column.id}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`flex flex-1 flex-col gap-3 rounded-xl p-3 transition-colors ${
                    snapshot.isDraggingOver ? "bg-slate-200/70" : "bg-slate-200/40"
                  }`}
                >
                  {columns[column.id].map((client, index) => (
                    <Draggable
                      key={client.id}
                      draggableId={client.id}
                      index={index}
                    >
                      {(dragProvided, dragSnapshot) => (
                        <article
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          {...dragProvided.dragHandleProps}
                          className={`relative rounded-xl bg-white p-4 shadow-card transition-shadow ${
                            dragSnapshot.isDragging
                              ? "shadow-elevated ring-2 ring-accent/20"
                              : ""
                          }`}
                        >
                          {client.pendingNotifications && (
                            <Circle
                              className="absolute right-3 top-3 h-2.5 w-2.5 fill-yellow-400 text-yellow-400"
                              aria-label="Pending notification"
                            />
                          )}

                          <h3 className="pr-6 text-sm font-semibold text-content">
                            {getClientName(client)}
                          </h3>
                          <p className="mt-1 text-xs text-content-secondary">
                            {client.company || "No company listed"}
                          </p>
                        </article>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        ))}
      </div>
    </DragDropContext>
  );
}
