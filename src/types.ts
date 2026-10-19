export interface StagingUser {
  readonly _id?: any;
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly salt: string;
  readonly role: 'qa_pilot' | 'viewer';
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TicketCategory {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly currency: 'USD';
  readonly availableCount: number;
  readonly isFake: true;
}

export interface StagingEvent {
  readonly _id?: any;
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly date: string;
  readonly venue: string;
  readonly status: 'open' | 'closed' | 'sold_out';
  readonly ticketCategories: readonly TicketCategory[];
  readonly totalAvailableTickets: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StagingSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly email: string;
  readonly createdAt: number;
  readonly expiresAt: number;
}
