import { Elysia, t } from "elysia";
import {
  listPlaygroundConversations,
  findPlaygroundConversation,
  insertPlaygroundConversation,
  updatePlaygroundConversation,
  deletePlaygroundConversation,
  listPlaygroundMessages,
  insertPlaygroundMessage,
  deletePlaygroundMessages,
  listPlaygroundTestCases,
  findPlaygroundTestCase,
  insertPlaygroundTestCase,
  updatePlaygroundTestCase,
  deletePlaygroundTestCase,
  listPlaygroundTestRuns,
  findPlaygroundTestRun,
  insertPlaygroundTestRun,
  deletePlaygroundTestRun,
  listPlaygroundTestResults,
  insertPlaygroundTestResult,
  updatePlaygroundTestResult,
} from "@/db";

const paramsSchema = t.Optional(
  t.Object({
    systemPrompt: t.Optional(t.String()),
    temperature: t.Optional(t.Number({ minimum: 0, maximum: 2 })),
    topP: t.Optional(t.Number({ minimum: 0, maximum: 1 })),
    topK: t.Optional(t.Number({ minimum: 0 })),
    maxTokens: t.Optional(t.Number({ minimum: 1 })),
    stopSequences: t.Optional(t.Array(t.String())),
    frequencyPenalty: t.Optional(t.Number({ minimum: -2, maximum: 2 })),
    presencePenalty: t.Optional(t.Number({ minimum: -2, maximum: 2 })),
  }),
);

// ============================================
// Conversation Routes
// ============================================

const conversationRoutes = new Elysia({ prefix: "/conversations" })
  .get(
    "/",
    async ({ query }) => {
      const offset = query.offset ?? 0;
      const limit = query.limit ?? 50;
      return await listPlaygroundConversations(offset, limit);
    },
    {
      query: t.Object({
        offset: t.Optional(t.Numeric()),
        limit: t.Optional(t.Numeric()),
      }),
      detail: {
        description: "List playground conversations",
        tags: ["Admin - Playground"],
      },
    },
  )
  .get(
    "/:id",
    async ({ params: { id }, status }) => {
      const conv = await findPlaygroundConversation(id);
      if (!conv) {
        return status(404, { error: "Conversation not found" });
      }
      const messages = await listPlaygroundMessages(id);
      return { ...conv, messages };
    },
    {
      params: t.Object({ id: t.Numeric() }),
      detail: {
        description: "Get conversation with messages",
        tags: ["Admin - Playground"],
      },
    },
  )
  .post(
    "/",
    async ({ body }) => {
      return await insertPlaygroundConversation(body);
    },
    {
      body: t.Object({
        title: t.String({ minLength: 1, maxLength: 255 }),
        model: t.String({ minLength: 1, maxLength: 63 }),
        apiKeyId: t.Optional(t.Number()),
        params: paramsSchema,
      }),
      detail: {
        description: "Create conversation",
        tags: ["Admin - Playground"],
      },
    },
  )
  .put(
    "/:id",
    async ({ params: { id }, body, status }) => {
      const existing = await findPlaygroundConversation(id);
      if (!existing) {
        return status(404, { error: "Conversation not found" });
      }
      return await updatePlaygroundConversation(id, body);
    },
    {
      params: t.Object({ id: t.Numeric() }),
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
        model: t.Optional(t.String({ minLength: 1, maxLength: 63 })),
        apiKeyId: t.Optional(t.Union([t.Number(), t.Null()])),
        params: paramsSchema,
      }),
      detail: {
        description: "Update conversation",
        tags: ["Admin - Playground"],
      },
    },
  )
  .delete(
    "/:id",
    async ({ params: { id }, status }) => {
      const conv = await deletePlaygroundConversation(id);
      if (!conv) {
        return status(404, { error: "Conversation not found" });
      }
      return { success: true };
    },
    {
      params: t.Object({ id: t.Numeric() }),
      detail: {
        description: "Delete conversation (soft delete)",
        tags: ["Admin - Playground"],
      },
    },
  )
  .post(
    "/:id/messages",
    async ({ params: { id }, body, status }) => {
      const conv = await findPlaygroundConversation(id);
      if (!conv) {
        return status(404, { error: "Conversation not found" });
      }
      return await insertPlaygroundMessage({
        conversationId: id,
        ...body,
      });
    },
    {
      params: t.Object({ id: t.Numeric() }),
      body: t.Object({
        role: t.Union([
          t.Literal("system"),
          t.Literal("user"),
          t.Literal("assistant"),
        ]),
        content: t.String(),
        completionId: t.Optional(t.Number()),
      }),
      detail: {
        description: "Add message to conversation",
        tags: ["Admin - Playground"],
      },
    },
  )
  .delete(
    "/:id/messages",
    async ({ params: { id }, status }) => {
      const conv = await findPlaygroundConversation(id);
      if (!conv) {
        return status(404, { error: "Conversation not found" });
      }
      await deletePlaygroundMessages(id);
      return { success: true };
    },
    {
      params: t.Object({ id: t.Numeric() }),
      detail: {
        description: "Clear all messages in conversation",
        tags: ["Admin - Playground"],
      },
    },
  );

// ============================================
// Test Case Routes
// ============================================

const testCaseRoutes = new Elysia({ prefix: "/test-cases" })
  .get(
    "/",
    async ({ query }) => {
      const offset = query.offset ?? 0;
      const limit = query.limit ?? 50;
      return await listPlaygroundTestCases(offset, limit);
    },
    {
      query: t.Object({
        offset: t.Optional(t.Numeric()),
        limit: t.Optional(t.Numeric()),
      }),
      detail: {
        description: "List test cases",
        tags: ["Admin - Playground"],
      },
    },
  )
  .get(
    "/:id",
    async ({ params: { id }, status }) => {
      const tc = await findPlaygroundTestCase(id);
      if (!tc) {
        return status(404, { error: "Test case not found" });
      }
      return tc;
    },
    {
      params: t.Object({ id: t.Numeric() }),
      detail: {
        description: "Get test case",
        tags: ["Admin - Playground"],
      },
    },
  )
  .post(
    "/",
    async ({ body }) => {
      return await insertPlaygroundTestCase(body);
    },
    {
      body: t.Object({
        title: t.String({ minLength: 1, maxLength: 255 }),
        description: t.Optional(t.String()),
        messages: t.Array(
          t.Object({
            role: t.String(),
            content: t.String(),
          }),
        ),
        params: paramsSchema,
      }),
      detail: {
        description: "Create test case",
        tags: ["Admin - Playground"],
      },
    },
  )
  .put(
    "/:id",
    async ({ params: { id }, body, status }) => {
      const existing = await findPlaygroundTestCase(id);
      if (!existing) {
        return status(404, { error: "Test case not found" });
      }
      return await updatePlaygroundTestCase(id, body);
    },
    {
      params: t.Object({ id: t.Numeric() }),
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
        description: t.Optional(t.Union([t.String(), t.Null()])),
        messages: t.Optional(
          t.Array(
            t.Object({
              role: t.String(),
              content: t.String(),
            }),
          ),
        ),
        params: paramsSchema,
      }),
      detail: {
        description: "Update test case",
        tags: ["Admin - Playground"],
      },
    },
  )
  .delete(
    "/:id",
    async ({ params: { id }, status }) => {
      const tc = await deletePlaygroundTestCase(id);
      if (!tc) {
        return status(404, { error: "Test case not found" });
      }
      return { success: true };
    },
    {
      params: t.Object({ id: t.Numeric() }),
      detail: {
        description: "Delete test case (soft delete)",
        tags: ["Admin - Playground"],
      },
    },
  );

// ============================================
// Test Run Routes
// ============================================

const testRunRoutes = new Elysia({ prefix: "/test-runs" })
  .get(
    "/",
    async ({ query }) => {
      const offset = query.offset ?? 0;
      const limit = query.limit ?? 50;
      return await listPlaygroundTestRuns(offset, limit, query.testCaseId);
    },
    {
      query: t.Object({
        offset: t.Optional(t.Numeric()),
        limit: t.Optional(t.Numeric()),
        testCaseId: t.Optional(t.Numeric()),
      }),
      detail: {
        description: "List test runs",
        tags: ["Admin - Playground"],
      },
    },
  )
  .get(
    "/:id",
    async ({ params: { id }, status }) => {
      const run = await findPlaygroundTestRun(id);
      if (!run) {
        return status(404, { error: "Test run not found" });
      }
      const results = await listPlaygroundTestResults(id);
      return { ...run, results };
    },
    {
      params: t.Object({ id: t.Numeric() }),
      detail: {
        description: "Get test run with results",
        tags: ["Admin - Playground"],
      },
    },
  )
  .post(
    "/",
    async ({ body }) => {
      const run = await insertPlaygroundTestRun(body);
      if (!run) {
        return { error: "Failed to create test run" };
      }
      // Create pending results for each model
      for (const model of body.models) {
        await insertPlaygroundTestResult({
          testRunId: run.id,
          model,
          status: "pending",
        });
      }
      const results = await listPlaygroundTestResults(run.id);
      return { ...run, results };
    },
    {
      body: t.Object({
        testCaseId: t.Number(),
        apiKeyId: t.Optional(t.Number()),
        models: t.Array(t.String(), { minItems: 1 }),
      }),
      detail: {
        description: "Create test run with pending results",
        tags: ["Admin - Playground"],
      },
    },
  )
  .delete(
    "/:id",
    async ({ params: { id }, status }) => {
      const run = await deletePlaygroundTestRun(id);
      if (!run) {
        return status(404, { error: "Test run not found" });
      }
      return { success: true };
    },
    {
      params: t.Object({ id: t.Numeric() }),
      detail: {
        description: "Delete test run (soft delete)",
        tags: ["Admin - Playground"],
      },
    },
  );

// ============================================
// Test Result Routes
// ============================================

const testResultRoutes = new Elysia({ prefix: "/test-results" }).put(
  "/:id",
  async ({ params: { id }, body }) => {
    return await updatePlaygroundTestResult(id, body);
  },
  {
    params: t.Object({ id: t.Numeric() }),
    body: t.Object({
      status: t.Optional(
        t.Union([
          t.Literal("pending"),
          t.Literal("running"),
          t.Literal("completed"),
          t.Literal("failed"),
        ]),
      ),
      response: t.Optional(t.Union([t.String(), t.Null()])),
      promptTokens: t.Optional(t.Number()),
      completionTokens: t.Optional(t.Number()),
      ttft: t.Optional(t.Number()),
      duration: t.Optional(t.Number()),
      errorMessage: t.Optional(t.Union([t.String(), t.Null()])),
      completionId: t.Optional(t.Number()),
    }),
    detail: {
      description: "Update test result",
      tags: ["Admin - Playground"],
    },
  },
);

// ============================================
// Combine all playground routes
// ============================================

export const adminPlayground = new Elysia({ prefix: "/playground" })
  .use(conversationRoutes)
  .use(testCaseRoutes)
  .use(testRunRoutes)
  .use(testResultRoutes);
