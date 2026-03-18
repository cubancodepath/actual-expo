import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import {
  merkle,
  makeClientId,
  serializeClock,
  deserializeClock,
  makeClock,
  setClock,
  Timestamp,
} from "./src/crdt";
import { Message, SyncRequest, SyncResponse } from "./src/proto";
import { encode, decode } from "./src/sync/encoder";
import { openDatabase } from "./src/db";
import { loadClock } from "./src/sync";
import { usePrefsStore } from "./src/stores/prefsStore";
import { useAccountsStore } from "./src/stores/accountsStore";
import { useCategoriesStore } from "./src/stores/categoriesStore";
import { useBudgetStore } from "./src/stores/budgetStore";

type TestResult = {
  name: string;
  ok: boolean;
  detail: string;
};

// ---------------------------------------------------------------------------
// CRDT protocol tests (already passing)
// ---------------------------------------------------------------------------
async function runCrdtTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  try {
    const id = makeClientId();
    results.push({
      name: "makeClientId()",
      ok: id.length === 16,
      detail: `"${id}"`,
    });
  } catch (e: unknown) {
    results.push({ name: "makeClientId()", ok: false, detail: String(e) });
  }

  try {
    const clientId = makeClientId();
    Timestamp.init({ node: clientId });
    const ts = Timestamp.send();
    results.push({
      name: "Timestamp.send()",
      ok: ts !== null,
      detail: String(ts),
    });
  } catch (e: unknown) {
    results.push({ name: "Timestamp.send()", ok: false, detail: String(e) });
  }

  try {
    const clientId = makeClientId();
    const ts = new Timestamp(Date.now(), 0, clientId);
    const clock = makeClock(ts);
    const restored = deserializeClock(serializeClock(clock));
    results.push({
      name: "serializeClock / deserializeClock",
      ok: restored.timestamp.node() === clientId,
      detail: restored.timestamp.node(),
    });
  } catch (e: unknown) {
    results.push({
      name: "serializeClock / deserializeClock",
      ok: false,
      detail: String(e),
    });
  }

  try {
    const ts1 = new Timestamp(Date.now(), 0, makeClientId());
    const ts2 = new Timestamp(Date.now() + 60000, 0, makeClientId());
    const t1 = merkle.insert(merkle.emptyTrie(), ts1);
    const t2 = merkle.insert(merkle.emptyTrie(), ts2);
    const diffTime = merkle.diff(t1, t2);
    results.push({
      name: "merkle.insert / diff",
      ok: diffTime !== null,
      detail: `diff=${diffTime}`,
    });
  } catch (e: unknown) {
    results.push({
      name: "merkle.insert / diff",
      ok: false,
      detail: String(e),
    });
  }

  try {
    const bytes = Message.encodeToBinary({
      dataset: "transactions",
      row: "r1",
      column: "amount",
      value: "N:5000",
    });
    const dec = Message.decodeFromBinary(bytes);
    results.push({
      name: "Message protobuf round-trip",
      ok: dec.value === "N:5000",
      detail: `bytes=${bytes.length}`,
    });
  } catch (e: unknown) {
    results.push({
      name: "Message protobuf round-trip",
      ok: false,
      detail: String(e),
    });
  }

  try {
    const reqBytes = SyncRequest.encodeToBinary({
      messages: [
        {
          timestamp: "2024-01-01T00:00:00.000Z-0000-0123456789ABCDEF",
          isEncrypted: false,
          content: Message.encodeToBinary({
            dataset: "accounts",
            row: "r1",
            column: "name",
            value: "S:Test",
          }),
        },
      ],
      fileId: "file-001",
      groupId: "group-001",
      keyId: "",
      since: "2024-01-01T00:00:00.000Z-0000-0000000000000000",
    });
    const req = SyncRequest.decodeFromBinary(reqBytes);
    results.push({
      name: "SyncRequest protobuf",
      ok: req.fileId === "file-001",
      detail: `bytes=${reqBytes.length}`,
    });
  } catch (e: unknown) {
    results.push({
      name: "SyncRequest protobuf",
      ok: false,
      detail: String(e),
    });
  }

  try {
    const clientId = makeClientId();
    Timestamp.init({ node: clientId });
    const ts = Timestamp.send()!;
    setClock(makeClock(ts));
    const msg = {
      timestamp: ts,
      dataset: "transactions",
      row: "tx1",
      column: "amount",
      value: "N:1500",
    };
    const requestBytes = await encode("group-1", "file-1", ts, [msg]);
    const responseBytes = SyncResponse.encodeToBinary({
      messages: [
        {
          timestamp: ts.toString(),
          isEncrypted: false,
          content: Message.encodeToBinary({
            dataset: msg.dataset,
            row: msg.row,
            column: msg.column,
            value: String(msg.value),
          }),
        },
      ],
      merkle: "{}",
    });
    const { messages: decoded } = await decode(responseBytes);
    const ok = requestBytes.length > 0 && decoded[0]?.value === "N:1500";
    results.push({
      name: "encoder encode/decode",
      ok,
      detail: `req=${requestBytes.length}b`,
    });
  } catch (e: unknown) {
    results.push({
      name: "encoder encode/decode",
      ok: false,
      detail: String(e),
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// DB + CRDT write tests
// ---------------------------------------------------------------------------
async function runDbTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  try {
    const { BUDGETS_DIR } = await import("./src/services/budgetMetadata");
    const { makeDirectoryAsync } = await import("expo-file-system/legacy");
    const testDir = `${BUDGETS_DIR}test-budget/`;
    await makeDirectoryAsync(testDir, { intermediates: true });
    await openDatabase(testDir);
    await loadClock();
    results.push({
      name: "openDatabase() + loadClock()",
      ok: true,
      detail: "db.sqlite opened",
    });
  } catch (e: unknown) {
    results.push({
      name: "openDatabase() + loadClock()",
      ok: false,
      detail: String(e),
    });
    return results; // no point continuing if DB failed
  }

  try {
    const { createAccount, getAccounts } = await import("./src/accounts");
    const id = await createAccount({ name: "Test Checking" });
    const accounts = await getAccounts();
    const found = accounts.find((a) => a.id === id);
    results.push({
      name: "createAccount() + getAccounts()",
      ok: !!found && found.name === "Test Checking",
      detail: `id=${id.slice(0, 8)}…, total=${accounts.length}`,
    });
  } catch (e: unknown) {
    results.push({
      name: "createAccount() + getAccounts()",
      ok: false,
      detail: String(e),
    });
  }

  try {
    const { createCategoryGroup, createCategory, getCategories } = await import("./src/categories");
    const groupId = await createCategoryGroup({ name: "Food" });
    const catId = await createCategory({
      name: "Groceries",
      cat_group: groupId,
    });
    const cats = await getCategories();
    const found = cats.find((c) => c.id === catId);
    results.push({
      name: "createCategoryGroup() + createCategory()",
      ok: !!found && found.name === "Groceries",
      detail: `cat=${catId.slice(0, 8)}…`,
    });
  } catch (e: unknown) {
    results.push({
      name: "createCategoryGroup() + createCategory()",
      ok: false,
      detail: String(e),
    });
  }

  try {
    const { getAccounts } = await import("./src/accounts");
    const { addTransaction, getTransactions } = await import("./src/transactions");
    const accounts = await getAccounts();
    if (accounts.length === 0) throw new Error("no accounts");
    const acctId = accounts[0].id;
    const txId = await addTransaction({
      account: acctId,
      date: 20250302,
      amount: -5000,
    });
    const txns = await getTransactions({ accountId: acctId });
    const found = txns.find((t) => t.id === txId);
    results.push({
      name: "addTransaction() + getTransactions()",
      ok: !!found && found.amount === -5000,
      detail: `amount=${found?.amount} cents`,
    });
  } catch (e: unknown) {
    results.push({
      name: "addTransaction() + getTransactions()",
      ok: false,
      detail: String(e),
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function App() {
  const [crdtResults, setCrdtResults] = useState<TestResult[]>([]);
  const [dbResults, setDbResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    // Bootstrap stores
    usePrefsStore.getState().loadToken().catch(console.warn);

    Promise.all([runCrdtTests().then(setCrdtResults), runDbTests().then(setDbResults)]).finally(
      () => setRunning(false),
    );
  }, []);

  const allResults = [...crdtResults, ...dbResults];
  const passed = allResults.filter((r) => r.ok).length;
  const total = allResults.length;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>actual-expo</Text>
      <Text style={styles.subtitle}>CRDT + DB integration tests</Text>

      {running ? (
        <Text style={styles.running}>Running…</Text>
      ) : (
        <>
          <Text style={[styles.summary, passed === total ? styles.allOk : styles.someFail]}>
            {passed}/{total} tests passed
          </Text>

          <Text style={styles.section}>CRDT Protocol</Text>
          {crdtResults.map((r, i) => (
            <ResultCard key={i} result={r} />
          ))}

          <Text style={styles.section}>SQLite + CRDT writes</Text>
          {dbResults.map((r, i) => (
            <ResultCard key={i} result={r} />
          ))}
        </>
      )}
    </ScrollView>
  );
}

function ResultCard({ result: r }: { result: TestResult }) {
  return (
    <View style={[styles.card, r.ok ? styles.cardOk : styles.cardFail]}>
      <Text style={styles.cardTitle}>
        {r.ok ? "✓" : "✗"} {r.name}
      </Text>
      <Text style={styles.cardDetail}>{r.detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  title: { fontSize: 22, fontWeight: "700", color: "#f1f5f9", marginBottom: 2 },
  subtitle: { fontSize: 14, color: "#94a3b8", marginBottom: 24 },
  running: { color: "#94a3b8", fontSize: 16 },
  summary: { fontSize: 18, fontWeight: "600", marginBottom: 16 },
  allOk: { color: "#4ade80" },
  someFail: { color: "#f87171" },
  section: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 8,
  },
  card: { borderRadius: 8, padding: 12, marginBottom: 8 },
  cardOk: { backgroundColor: "#14532d" },
  cardFail: { backgroundColor: "#7f1d1d" },
  cardTitle: { color: "#f1f5f9", fontWeight: "600", marginBottom: 4 },
  cardDetail: { color: "#cbd5e1", fontSize: 11, fontFamily: "monospace" },
});
