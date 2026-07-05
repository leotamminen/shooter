export interface StateHandlers<TState extends string, TContext> {
  onEnter?: (context: TContext, from: TState | null) => void;
  onUpdate?: (context: TContext, delta: number) => void;
  onExit?: (context: TContext, to: TState) => void;
}

export class StateMachine<TState extends string, TContext> {
  private current: TState;

  private readonly states: Record<TState, StateHandlers<TState, TContext>>;
  private readonly context: TContext;

  constructor(
    initial: TState,
    states: Record<TState, StateHandlers<TState, TContext>>,
    context: TContext,
  ) {
    this.current = initial;
    this.states = states;
    this.context = context;

    this.states[initial].onEnter?.(this.context, null);
  }

  get state(): TState {
    return this.current;
  }

  transition(next: TState): void {
    if (next === this.current) return;

    this.states[this.current].onExit?.(this.context, next);
    const previous = this.current;
    this.current = next;
    this.states[next].onEnter?.(this.context, previous);
  }

  update(delta: number): void {
    this.states[this.current].onUpdate?.(this.context, delta);
  }
}
