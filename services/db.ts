
export const db = {
  name: 'NobelinoDB',
  version: 1,
  
  isSupported() {
    return typeof indexedDB !== 'undefined';
  },

  async open() {
    if (!this.isSupported()) {
      throw new Error("Navegador não suportado.");
    }
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.name, this.version);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('state')) {
          db.createObjectStore('state');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async save(key: string, value: any) {
    const database = await this.open();
    return new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('state', 'readwrite');
      const store = transaction.objectStore('state');
      store.put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },

  async get(key: string) {
    const database = await this.open();
    return new Promise<any>((resolve, reject) => {
      const transaction = database.transaction('state', 'readonly');
      const store = transaction.objectStore('state');
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async addKnowledge(topic: string, content: string) {
    const current = await this.get('nobel_knowledge_base') || [];
    const newEntry = {
      id: Date.now().toString(),
      topic,
      content,
      type: 'rule',
      active: true
    };
    const updated = [newEntry, ...current];
    await this.save('nobel_knowledge_base', updated);
    return newEntry;
  },

  async addProcess(name: string, steps: string[]) {
    const current = await this.get('nobel_processes') || [];
    const newProcess = {
      id: Date.now().toString(),
      name,
      steps,
      category: 'venda'
    };
    const updated = [newProcess, ...current];
    await this.save('nobel_processes', updated);
    return newProcess;
  },

  // Fix: Updated syncInventory to return results count (added/updated) to fix type error in InventoryManager
  async syncInventory(incomingBooks: any[]) {
    const inventory = await this.get('nobel_inventory') || [];
    const updatedInventory = [...inventory];
    let added = 0;
    let updated = 0;
    incomingBooks.forEach(incoming => {
      const isbnStr = String(incoming.ISBN || incoming.isbn || "");
      const idx = updatedInventory.findIndex(b => b.isbn === isbnStr);
      if (idx !== -1) {
        updatedInventory[idx] = { ...updatedInventory[idx], ...incoming };
        updated++;
      } else {
        updatedInventory.push({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          title: incoming.title || incoming.Title || "Sem título",
          author: incoming.author || incoming.Author || "Desconhecido",
          isbn: isbnStr,
          price: Number(incoming.price || incoming.Price || 0),
          stockCount: Number(incoming.stockCount || incoming.Stock || 0),
          description: incoming.description || ""
        });
        added++;
      }
    });
    await this.save('nobel_inventory', updatedInventory);
    return { added, updated };
  },

  async updateDailySales(amount: number) {
    const today = new Date().toISOString().split('T')[0];
    const goals = await this.get('nobel_sales_goals') || [];
    let todayGoal = goals.find((g: any) => g.date === today);
    if (!todayGoal) {
      todayGoal = { id: today, date: today, minGoal: 0, superGoal: 0, actualSales: 0 };
      goals.push(todayGoal);
    }
    todayGoal.actualSales += amount;
    await this.save('nobel_sales_goals', goals);
    return todayGoal;
  },

  // Fix: Added setDailyGoal method to correctly save min and super goals for the current day to fix type error in Dashboard
  async setDailyGoal(minGoal: number, superGoal: number) {
    const today = new Date().toISOString().split('T')[0];
    const goals = await this.get('nobel_sales_goals') || [];
    let todayGoal = goals.find((g: any) => g.date === today);
    if (!todayGoal) {
      todayGoal = { id: today, date: today, minGoal, superGoal, actualSales: 0 };
      goals.push(todayGoal);
    } else {
      todayGoal.minGoal = minGoal;
      todayGoal.superGoal = superGoal;
    }
    await this.save('nobel_sales_goals', goals);
    return todayGoal;
  },

  async exportBrain() {
    const data = {};
    const database = await this.open();
    return new Promise<any>((resolve, reject) => {
      const transaction = database.transaction('state', 'readonly');
      const store = transaction.objectStore('state');
      const getKeys = store.getAllKeys();
      const getValues = store.getAll();
      transaction.oncomplete = () => {
        getKeys.result.forEach((key, i) => {
          (data as any)[key as string] = getValues.result[i];
        });
        resolve(data);
      };
      transaction.onerror = () => reject(transaction.error);
    });
  },

  async importBrain(data: any) {
    const database = await this.open();
    return new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('state', 'readwrite');
      const store = transaction.objectStore('state');
      store.clear().onsuccess = () => {
        for (const key in data) {
          store.put(data[key], key);
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
};
