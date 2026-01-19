export class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.cache = new Map(); // Stores key -> Node
    // Doubly linked list to track order
    this.head = null;
    this.tail = null;
  }

  get(key) {
    if (!this.cache.has(key)) return null;

    const node = this.cache.get(key);
    this.moveToFront(node);
    return node.value;
  }

  put(key, value) {
    if (this.cache.has(key)) {
      const node = this.cache.get(key);
      node.value = value;
      this.moveToFront(node);
      return;
    }

    const newNode = { key, value, prev: null, next: null };
    this.cache.set(key, newNode);
    this.addToFront(newNode);

    if (this.cache.size > this.capacity) {
      this.removeLast();
    }
  }

  // Moves an existing node to the front (MRU position)
  moveToFront(node) {
    if (node === this.head) return; // Already at front

    // Detach from current position
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;

    if (node === this.tail) {
      this.tail = node.prev; // Update tail if we moved the tail
    }

    // Attach to front
    node.prev = null;
    node.next = this.head;
    if (this.head) this.head.prev = node;
    this.head = node;
  }

  // Adds a new node to the front
  addToFront(node) {
    if (!this.head) {
      this.head = node;
      this.tail = node;
    } else {
      node.next = this.head;
      this.head.prev = node;
      this.head = node;
    }
  }

  // Removes the last node (LRU position)
  removeLast() {
    if (!this.tail) return;

    const keyToRemove = this.tail.key;
    this.cache.delete(keyToRemove);

    if (this.head === this.tail) {
      this.head = null;
      this.tail = null;
    } else {
      this.tail = this.tail.prev;
      this.tail.next = null;
    }
  }
}
