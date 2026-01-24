
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

  async syncInventory(incomingBooks: any[]) {
    const inventory = await this.get('nobel_inventory') || [];
    let updatedCount = 0;
    let addedCount = 0;
    const updatedInventory = [...inventory];

    incomingBooks.forEach(incoming => {
      const existingIndex = updatedInventory.findIndex(b => b.isbn === incoming.isbn);
      if (existingIndex !== -1) {
        updatedInventory[existingIndex] = {
          ...updatedInventory[existingIndex],
          title: incoming.title || updatedInventory[existingIndex].title,
          author: incoming.author || updatedInventory[existingIndex].author,
          description: incoming.description || updatedInventory[existingIndex].description,
          genre: incoming.genre || updatedInventory[existingIndex].genre,
          price: incoming.price !== undefined ? incoming.price : updatedInventory[existingIndex].price,
          stockCount: incoming.stockCount !== undefined ? incoming.stockCount : updatedInventory[existingIndex].stockCount,
          enriched: incoming.description ? true : updatedInventory[existingIndex].enriched
        };
        updatedCount++;
      } else {
        updatedInventory.push({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          title: incoming.title || "Livro sem título",
          author: incoming.author || "Autor desconhecido",
          isbn: incoming.isbn,
          description: incoming.description || "",
          genre: incoming.genre || "Geral",
          targetAge: incoming.targetAge || "Livre",
          price: incoming.price || 0,
          stockCount: incoming.stockCount || 0,
          enriched: !!incoming.description
        });
        addedCount++;
      }
    });

    await this.save('nobel_inventory', updatedInventory);
    return { addedCount, updatedCount };
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
  },

  async updateStockAndSales(sales: {isbn: string, quantity: number, price?: number}[], targetDate: string, overwrite: boolean = false) {
    const inventory = await this.get('nobel_inventory') || [];
    const goals = await this.get('nobel_sales_goals') || [];
    const salesLog = await this.get('nobel_daily_sales_log') || {};

    const dateToUpdate = targetDate;
    const currentInventory = [...inventory];
    const currentGoals = [...goals];
    const currentLog = { ...salesLog };

    // Agrupar vendas
    const newFileSales = sales.reduce((acc, curr) => {
      if (!acc[curr.isbn]) acc[curr.isbn] = { quantity: 0, totalPrice: 0, hasPrice: false };
      acc[curr.isbn].quantity += curr.quantity;
      if (curr.price !== undefined && !isNaN(curr.price)) {
        acc[curr.isbn].totalPrice += (curr.price * curr.quantity);
        acc[curr.isbn].hasPrice = true;
      }
      return acc;
    }, {} as Record<string, { quantity: number, totalPrice: number, hasPrice: boolean }>);

    // Reversão de estoque para o dia (se modo sobrescrever)
    if (overwrite && currentLog[dateToUpdate]) {
      const previousSales = currentLog[dateToUpdate];
      for (const isbn in previousSales) {
        const bookIdx = currentInventory.findIndex(b => b.isbn === isbn);
        if (bookIdx !== -1) {
          currentInventory[bookIdx].stockCount += previousSales[isbn];
        }
      }
      currentLog[dateToUpdate] = {};
    }

    let totalFinancialValue = 0;
    let totalQuantitySubtracted = 0;
    let spreadsheetRowsCount = Object.keys(newFileSales).length;
    const dailyDetail = currentLog[dateToUpdate] || {};

    for (const isbn in newFileSales) {
      const sale = newFileSales[isbn];
      const bookIdx = currentInventory.findIndex(b => b.isbn === isbn);
      
      // CALCULA VALOR FINANCEIRO SEMPRE (Mesmo que não tenha o livro no acervo)
      if (sale.hasPrice) {
        totalFinancialValue += sale.totalPrice;
      } else if (bookIdx !== -1) {
        totalFinancialValue += (currentInventory[bookIdx].price * sale.quantity);
      }

      // BAIXA ESTOQUE APENAS SE O LIVRO EXISTIR
      if (bookIdx !== -1) {
        currentInventory[bookIdx].stockCount = Math.max(0, currentInventory[bookIdx].stockCount - sale.quantity);
        totalQuantitySubtracted += sale.quantity;
        dailyDetail[isbn] = (dailyDetail[isbn] || 0) + sale.quantity;
      }
    }

    currentLog[dateToUpdate] = dailyDetail;

    // Atualizar Metas
    const existingGoalIndex = currentGoals.findIndex((g: any) => g.date === dateToUpdate);
    if (existingGoalIndex !== -1) {
      if (overwrite) {
        currentGoals[existingGoalIndex].actualSales = totalFinancialValue;
      } else {
        currentGoals[existingGoalIndex].actualSales += totalFinancialValue;
      }
    } else {
      currentGoals.push({
        id: Date.now().toString(),
        date: dateToUpdate,
        minGoal: 0,
        superGoal: 0,
        actualSales: totalFinancialValue
      });
    }

    await this.save('nobel_inventory', currentInventory);
    await this.save('nobel_sales_goals', currentGoals);
    await this.save('nobel_daily_sales_log', currentLog);

    return {
      itemsUpdated: spreadsheetRowsCount,
      totalValue: totalFinancialValue,
      stockSubtracted: totalQuantitySubtracted
    };
  }
};
