// AIOSpark Task Planner Router (Layer 17)
// Maps incoming event triggers (exception creation, scheduled jobs, manual requests) to corresponding agents.

export type TriggerType = 'EXCEPTION_CREATED' | 'SCHEDULED_ANALYST_RUN' | 'MANUAL_INVESTIGATION' | 'BROKEN_PROMISE_DETECTED';

export interface TriggerEvent {
  type: TriggerType;
  organizationId: string;
  payload: {
    invoiceId?: string;
    exceptionId?: string;
    extendedContextDocs?: string[];
    [key: string]: any;
  };
}

export interface TaskPlannerRoute {
  triggerType: TriggerType;
  targetAgent: string;
  description: string;
}

export class TaskPlanner {
  private static routes: TaskPlannerRoute[] = [
    {
      triggerType: 'SCHEDULED_ANALYST_RUN',
      targetAgent: 'Receivables Analyst',
      description: 'Triggers daily portfolio aging and exception shift report generation',
    },
    {
      triggerType: 'EXCEPTION_CREATED',
      targetAgent: 'Investigation Agent',
      description: 'Triggers root-cause invoice investigation upon new exception creation',
    },
    {
      triggerType: 'MANUAL_INVESTIGATION',
      targetAgent: 'Investigation Agent',
      description: 'Triggers manual on-demand root-cause invoice re-investigation',
    },
    {
      triggerType: 'BROKEN_PROMISE_DETECTED',
      targetAgent: 'Collections Agent',
      description: 'Routes broken payment promise events to Collections Agent (Layer 19)',
    },
  ];

  public static getTargetAgent(triggerType: TriggerType): string | null {
    const route = this.routes.find((r) => r.triggerType === triggerType);
    return route ? route.targetAgent : null;
  }

  public static getRoutes(): TaskPlannerRoute[] {
    return [...this.routes];
  }

  public static routeTrigger(event: TriggerEvent): { targetAgent: string | null; routeDescription?: string } {
    const route = this.routes.find((r) => r.triggerType === event.type);
    if (!route) {
      return { targetAgent: null };
    }
    return {
      targetAgent: route.targetAgent,
      routeDescription: route.description,
    };
  }
}
