# FUTURE_VISION.md — Product Vision & Long-Term Roadmap

This document describes the long-term vision of the project.
It is meant to provide context to humans and AI assistants about
where the product is going, without constraining short-term execution.

This is not a technical specification.
This is a product and architectural vision.

If there is a conflict between this file and an implementation detail,
this file describes the direction, not the immediate constraint.

----------------------------------------------------------------
1. PRODUCT VISION
----------------------------------------------------------------

The product is a personal and family finance app focused on:

- shared expenses
- fairness and clarity in money between people
- understanding “who owes whom”
- answering the question: “does the money I have cover what I need to pay?”

The product is not traditional accounting.
It is not enterprise finance.
It is about everyday financial relationships.

The core idea is:
“Money between people should be simple, transparent, and calm.”

----------------------------------------------------------------
2. CORE PROBLEMS WE SOLVE
----------------------------------------------------------------

1) Shared expenses

    - Splitting costs between family and friends
    - Supporting people outside the household
    - Tracking balances without friction

2) Debt clarity

    - “How much does X owe me?”
    - “How much do I owe X?”
    - With full itemized detail

3) Cash reality

    - “I paid with credit card — will I be able to pay it at the end of the month?”
    - Understanding obligations vs available money

4) Spending awareness

    - Where money goes (categories)
    - How spending evolves month over month

5) Budget discipline

    - Setting monthly budgets
    - Seeing progress clearly (under / on track / exceeded)

----------------------------------------------------------------
3. TARGET USER
----------------------------------------------------------------

Primary user:

- Adults managing household finances
- Couples or families
- People who regularly split expenses with others

Secondary (future):

- Friends sharing trips or events
- Small informal groups
- Independent households using the app individually

The tone must always feel:

- human
- calm
- non-judgmental
- simple

----------------------------------------------------------------
4. LONG-TERM FEATURE AREAS
----------------------------------------------------------------

4.1 Shared expenses & debts

- Movements with participants
- Internal users and external contacts
- Automatic debt calculation
- Explicit debt payments
- Clear monthly summaries

4.2 Categories & reporting

- Custom categories per family
- Monthly and historical breakdowns
- Comparisons over time
- Visual summaries

4.3 Budgets

- Monthly budgets per category
- Progress indicators
- Over/under tracking
- Simple alerts (non intrusive)

4.4 Credit cards & cash reality

Primary question to answer:
“Given what I spent with my credit card this month,
do I have enough money to pay it at the end of the cycle?”

Scope:

- Track credit card spending
- Track card payments
- Compare against available cash
- Monthly clarity (not daily forecasting)

4.5 Accounts (future)

- Cash
- Bank accounts
- Credit cards
- Abstracted as sources of money or debt

4.6 Events (shared contexts)

Events represent temporary shared financial contexts:
- Trips, vacations, parties, shared projects
- Group expenses with multiple people over a period
- Can include household members AND external contacts
- Can include registered users AND unregistered people

Event Lifecycle:

1. Creation:
   - Define: name, dates, participants
   - Participants can be from your household or external

2. Active Event:
   - Add movements tagged to the event
   - All participants with accounts see updates in real-time
   - Running balance shows "who owes whom"
   - Live debt calculation (like Splitwise/Tricount)

3. Event Closure:
   - Mark event as "closed"
   - System generates final consolidation:
     → Total spent
     → Who paid what
     → Net balances (who owes whom, final amounts)
     → Itemized expense list
   - For registered participants:
     → Available in-app with full detail
     → Can settle debts directly in app
   - For unregistered participants:
     → Export summary as screenshot/PDF
     → Share manually (WhatsApp, email, etc.)
     → Mark debts as paid manually (no confirmation)

4. Settlement:
   - Registered users can settle via "debt payment" movements
   - Both parties must confirm payment
   - Debt cleared only after confirmation
   - Unregistered contacts: manual tracking only

Event Rules:
- Events overlay on top of regular finances
- Event expenses also count toward monthly budgets/categories
- Events provide an additional lens, not separate accounting
- Multiple events can run simultaneously
- Events can be reopened if needed

4.7 User Types & Contact Management

The app distinguishes between two types of people:

Household Members (Internal Users):
- Registered users who share finances completely
- Live together and split most/all expenses
- Full visibility into the family's finances
- Can create movements, events, budgets
- Examples: you and your partner, roommates

External Contacts:
- People outside your household with whom you have transactions
- Can be registered users (have their own account) or not
- Examples: siblings, parents, friends, travel companions

External Contacts WITH account (Linked Users):
- They have their own family in the app
- When you add a movement involving them:
  → They receive a notification
  → Movement appears in their app (as external transaction)
  → They can accept, dispute, or comment
  → Debt balance syncs bidirectionally in real-time
- When they mark a debt as paid:
  → You receive notification
  → You must confirm receipt
  → Only then debt is cleared for both
- Privacy: they only see movements where they are participants
- They never see your household's internal expenses

External Contacts WITHOUT account (Unregistered):
- Exist only as records in your family
- Cannot see movements in real-time
- You manually share event summaries (screenshot)
- No synchronization or confirmation needed
- Useful for: one-off trips, infrequent contacts

Contact Upgrade Flow:
- When an unregistered contact creates an account
- System detects existing movements by email/phone
- Offers to link historical data to their account
- User accepts → past movements become visible to them
- Debt balances sync from that point forward

----------------------------------------------------------------
5. MULTI-TENANCY & DATA OWNERSHIP
----------------------------------------------------------------

Core entities:

Family:
- Represents a household (not extended family)
- Has 1+ household members (internal users)
- Has 0+ external contacts (with or without accounts)
- Owns all movements, events, budgets, categories
- Data isolation: families never see each other's internal data

Household Members:
- Authenticated users
- Belong to exactly one family (in current scope)
- Full visibility within their family
- Can be simultaneously an external contact in other families

External Contacts:
- Belong to a family (the one who added them)
- Optional: linked to a registered user in another family
- If linked → creates bidirectional relationship

Cross-family Visibility:
- Jose (Family A) creates movement with Maria (Family B)
- Maria receives in-app notification
- Movement appears in Maria's app under "External Transactions"
- Maria sees: date, amount, description, who created it, participants
- Maria does NOT see: Jose's other expenses, Jose's budgets, etc.
- Debt balance updates for both automatically

Data Privacy Rules:
- Users only see their own family's internal movements
- Users see external movements where they are participants
- No user can browse or search another family's data
- Event summaries can be shared via export (screenshot, PDF)

All families share the same database.
Isolation is logical, not physical.

----------------------------------------------------------------
6. AI ASSISTANT (FUTURE)
----------------------------------------------------------------

The AI assistant is a conversational interface over trusted data.

It must:

- Answer questions using real data
- Never guess
- Be transparent about numbers
- Link answers to underlying records

Example questions:

- “How much did I spend on groceries this month?”
- “How much do I owe X?”
- “How much did we spend on the vacation event?”
- “Will I be able to pay my credit card this month?”
- “What category increased the most compared to last month?”

The AI translates natural language into:

- queries
- reports
- explanations

It is not a chatbot.
It is an interface to financial truth.

----------------------------------------------------------------
7. PHILOSOPHY
----------------------------------------------------------------

- Clarity over complexity
- Trust over cleverness
- Calm over control
- Insight over micromanagement

The app should feel like:
“Let’s make things clear and move on with life.”

----------------------------------------------------------------
8. NON-GOALS
----------------------------------------------------------------

- No heavy accounting terminology
- No forced financial ideology
- No gamification pressure
- No invasive notifications
- No dependency on third-party platforms for core logic

----------------------------------------------------------------
9. EVOLUTION PATH (HIGH LEVEL)
----------------------------------------------------------------

Phase 1 (Current - Auth):
- Authentication
- User management
- Session handling

Phase 2 (Next - Core Finance):
- Family creation
- Household members
- External contacts (unregistered)
- Basic movements (FAMILIAR, COMPARTIDO, PAGO_DEUDA)
- Categories
- Manual clarity

Phase 3 (Shared Finance):
- External contacts (registered, linked)
- Cross-family notifications
- Bidirectional debt sync
- Payment confirmation flows
- Events (basic)

Phase 4 (Events & Consolidation):
- Event lifecycle (open, active, close)
- Event consolidation (like Splitwise)
- Mixed participants (registered + unregistered)
- Export/screenshot summaries
- Budgets

Phase 5 (Credit & Cash Reality):
- Credit card tracking
- Cash reality checks
- Payment cycle awareness
- Accounts abstraction

Phase 6 (Intelligence):
- Reporting & analytics
- Month-over-month comparisons
- Spending insights
- AI conversational layer

----------------------------------------------------------------
10. DEBT SETTLEMENT & CONFIRMATION FLOWS
----------------------------------------------------------------

The app supports different settlement flows based on whether
the other person has an account or not.

10.1 Settlement with Registered Users (Bidirectional)

Scenario: Jose owes Maria $100

Option A - Jose initiates payment:
1. Jose creates movement type "PAGO_DEUDA"
   - Pagador: Jose
   - Contraparte: Maria
   - Amount: $100
2. Maria receives notification: "Jose marked a payment to you"
3. Maria reviews and confirms receipt
4. Debt cleared for both
5. If Maria disputes → Jose receives notification → must resolve

Option B - Maria initiates payment receipt:
1. Maria creates movement type "PAGO_DEUDA"
   - Pagador: Jose (she marks him as payer)
   - Contraparte: Maria
   - Amount: $100
2. Jose receives notification: "Maria marked that you paid her"
3. Jose confirms the payment
4. Debt cleared for both
5. If Jose disputes → Maria receives notification → must resolve

Confirmation Rules:
- Both parties must confirm for debt to clear
- Until confirmation, debt remains "pending settlement"
- Either party can add notes/comments
- System prevents duplicate settlements
- History preserved for audit

10.2 Settlement with Unregistered Contacts

Scenario: Jose owes Papá $50 (Papá has no account)

1. Jose creates movement type "PAGO_DEUDA"
   - Pagador: Jose
   - Contraparte: Papá
   - Amount: $50
2. No notification sent (Papá has no account)
3. Debt automatically cleared (no confirmation needed)
4. Jose's record updated immediately
5. Jose can add notes for his own reference

For event settlements:
- Generate consolidated summary
- Share screenshot showing "Papá paid $50"
- Mark as settled in Jose's app only

10.3 Dispute Resolution

If users disagree on amounts:
- Both see "disputed" status
- Can add comments
- Can attach photos/receipts
- Must manually resolve (app doesn't force)
- Can split difference or adjust
- Can involve event history for context

The app is a tool for clarity, not enforcement.

----------------------------------------------------------------
11. NOTIFICATIONS & REAL-TIME SYNC
----------------------------------------------------------------

The app uses notifications to keep cross-family transactions synchronized.

11.1 When to Notify

You receive notifications when:
- Someone adds a movement involving you (as participant or debtor)
- Someone marks a debt payment involving you
- Someone requests payment confirmation
- Someone disputes a payment
- An event you're in is closed
- Someone comments on a shared movement

You do NOT receive notifications for:
- Other people's internal household movements
- Events you're not part of
- Other families' activity

11.2 Notification Content

Each notification includes:
- Who triggered it (name, photo if available)
- What happened (movement created, payment marked, etc.)
- Amount involved
- Quick action buttons (Confirm, Dispute, View Details)
- Timestamp

Notifications are:
- Non-invasive (no pressure)
- Informational (help maintain clarity)
- Actionable (can respond directly)
- Grouped by event/context when relevant

11.3 Synchronization

When cross-family movements occur:
- Created in Family A → immediately visible in Family B
- Updated by Family A → syncs to Family B in real-time
- Confirmed by Family B → updates both families
- WebSocket or polling for live updates
- Offline support: syncs when back online

Privacy:
- Only the specific movement syncs
- No access to other family's data
- No leakage of internal expenses
- Audit log of who saw/modified what
