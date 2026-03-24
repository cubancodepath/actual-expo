/**
 * Dependency graph for the spreadsheet engine.
 *
 * Ported from Actual Budget's graph-data-structure.ts.
 * Tracks edges between cells (dependency → dependent) and supports
 * topological sorting for efficient recomputation ordering.
 */

export class DependencyGraph {
  /** dependency → Set of dependents (outgoing edges) */
  private edges = new Map<string, Set<string>>();
  /** dependent → Set of dependencies (incoming edges) */
  private incomingEdges = new Map<string, Set<string>>();

  addNode(node: string): void {
    if (!this.edges.has(node)) this.edges.set(node, new Set());
    if (!this.incomingEdges.has(node)) this.incomingEdges.set(node, new Set());
  }

  /**
   * Add a directed edge: when `from` changes, `to` must recompute.
   * `from` = dependency, `to` = dependent.
   */
  addEdge(from: string, to: string): void {
    this.addNode(from);
    this.addNode(to);
    this.edges.get(from)!.add(to);
    this.incomingEdges.get(to)!.add(from);
  }

  removeEdge(from: string, to: string): void {
    this.edges.get(from)?.delete(to);
    this.incomingEdges.get(to)?.delete(from);
  }

  /** Get all nodes that depend on `node` (its dependents). */
  getDependents(node: string): Set<string> {
    return this.edges.get(node) ?? new Set();
  }

  /** Get all nodes that `node` depends on (its dependencies). */
  getDependencies(node: string): Set<string> {
    return this.incomingEdges.get(node) ?? new Set();
  }

  removeNode(node: string): void {
    // Remove all outgoing edges
    for (const dependent of this.getDependents(node)) {
      this.incomingEdges.get(dependent)?.delete(node);
    }
    // Remove all incoming edges
    for (const dependency of this.getDependencies(node)) {
      this.edges.get(dependency)?.delete(node);
    }
    this.edges.delete(node);
    this.incomingEdges.delete(node);
  }

  /**
   * Topological sort starting from dirty nodes.
   * Returns all nodes that need recomputation in dependency order
   * (dependencies before dependents).
   */
  topologicalSort(dirtyNodes: string[]): string[] {
    const visited = new Set<string>();
    const result: string[] = [];
    const stack: Array<{ node: string; expanded: boolean }> = [];

    // Start with dirty nodes
    for (const node of dirtyNodes) {
      if (!visited.has(node)) {
        stack.push({ node, expanded: false });
      }
    }

    while (stack.length > 0) {
      const top = stack[stack.length - 1];

      if (top.expanded) {
        stack.pop();
        if (!visited.has(top.node)) {
          visited.add(top.node);
          result.push(top.node);
        }
      } else {
        top.expanded = true;
        // Push dependents onto stack (they must be computed after this node)
        for (const dependent of this.getDependents(top.node)) {
          if (!visited.has(dependent)) {
            stack.push({ node: dependent, expanded: false });
          }
        }
      }
    }

    // Post-order DFS produces dependents before dependencies.
    // Reverse to get dependencies-first order (correct for computation).
    result.reverse();
    return result;
  }
}
