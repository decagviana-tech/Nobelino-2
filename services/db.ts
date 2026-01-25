
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

  // Helper para normalizar ISBN (remove tudo que não é número)
  normalizeISBN(val: any): string {
    if (!val) return "";
    return String(val).replace(/\D/g, "");
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
    const newEntry = {
      id: Date.now().toString(),
      name,
      steps,
      category: 'venda'
    };
    const updated = [newEntry, ...current];
    await this.save('nobel_processes', updated);
    return newEntry;
  },

  parseValue(val: any): number | null {
    if (val === undefined || val === null || val === "") return null;
    if (typeof val === 'number') return val;
    const cleaned = String(val).replace(/[R$\s]/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  },

  getValueByPattern(obj: any, patterns: string[]): any {
    const keys = Object.keys(obj);
    for (const pattern of patterns) {
      if (obj[pattern] !== undefined) return obj[pattern];
      const foundKey = keys.find(k => k.toLowerCase().replace(/\s/g, '').includes(pattern.toLowerCase().replace(/\s/g, '')));
      if (foundKey) return obj[foundKey];
    }
    return undefined;
  },

  async syncInventory(incomingBooks: any[]) {
    const inventory = await this.get('nobel_inventory') || [];
    const updatedInventory = [...inventory];
    let added = 0;
    let updated = 0;

    const ISBN_ALIASES = ['ISBN', 'EAN', 'Codigo', 'CÓDIGO', 'Barras', 'Referencia', 'id'];
    const PRICE_ALIASES = ['Preço', 'Preco', 'Valor', 'Venda', 'Vlr', 'Preço Venda', 'Unitário', 'Price'];
    const STOCK_ALIASES = ['Estoque', 'Quantidade', 'Qtd', 'Saldo', 'UN', 'Unidades', 'Disponível', 'Stock'];
    const TITLE_ALIASES = ['Título', 'Titulo', 'Nome', 'Descrição', 'Descricao', 'Produto', 'Title'];
    const AUTHOR_ALIASES = ['Autor', 'Escritor', 'Author'];
    const GENRE_ALIASES = ['Gênero', 'Genero', 'Categoria', 'Seção', 'Secao', 'Departamento', 'Genre'];
    const SYNOPSIS_ALIASES = ['Sinopse', 'Descrição Longa', 'Resumo', 'Description', 'Synopsis'];

    incomingBooks.forEach(incoming => {
      const isbnRaw = this.getValueByPattern(incoming, ISBN_ALIASES);
      const isbnClean = this.normalizeISBN(isbnRaw);
      
      if (!isbnClean || isbnClean === "0") return;

      const title = this.getValueByPattern(incoming, TITLE_ALIASES);
      const author = this.getValueByPattern(incoming, AUTHOR_ALIASES);
      const genre = this.getValueByPattern(incoming, GENRE_ALIASES);
      const description = this.getValueByPattern(incoming, SYNOPSIS_ALIASES);
      
      const priceVal = this.parseValue(this.getValueByPattern(incoming, PRICE_ALIASES));
      const stockVal = this.parseValue(this.getValueByPattern(incoming, STOCK_ALIASES));

      // Busca usando o ISBN normalizado (apenas números)
      const idx = updatedInventory.findIndex(b => this.normalizeISBN(b.isbn) === isbnClean);
      
      if (idx !== -1) {
        const existing = updatedInventory[idx];
        
        updatedInventory[idx] = { 
          ...existing, 
          title: title ? String(title).trim() : existing.title,
          author: author ? String(author).trim() : existing.author,
          description: description ? String(description).trim() : existing.description,
          genre: genre ? String(genre).trim() : existing.genre,
          // SUBSTITUI (Overwrite) o valor para não somar duplicado
          price: (priceVal !== null) ? priceVal : existing.price,
          stockCount: (stockVal !== null) ? Math.floor(stockVal) : existing.stockCount,
          isbn: isbnClean, // Padroniza o ISBN no banco para apenas números
          enriched: !!(description || existing.description)
        };
        updated++;
      } else {
        if (title || isbnClean) {
          updatedInventory.push({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            title: title ? String(title).trim() : "Título não informado",
            author: author ? String(author).trim() : "Desconhecido",
            isbn: isbnClean,
            price: priceVal !== null ? priceVal : 0,
            stockCount: stockVal !== null ? Math.floor(stockVal) : 0,
            genre: genre ? String(genre).trim() : "Geral",
            description: description ? String(description).trim() : "",
            enriched: !!description
          });
          added++;
        }
      }
    });

    await this.save('nobel_inventory', updatedInventory);
    return { added, updated };
  },

  async clearInventory() {
    await this.save('nobel_inventory', []);
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
