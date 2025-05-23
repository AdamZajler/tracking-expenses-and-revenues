const cors = require('cors');
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('Błąd: Zmienna środowiskowa MONGODB_URI nie jest ustawiona.');
    process.exit(1);
}

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('Połączono pomyślnie ze zdalną bazą danych MongoDB.');
    })
    .catch(err => {
        console.error('Błąd połączenia z MongoDB:', err.message);
        process.exit(1);
    });

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'Błąd połączenia z MongoDB (po nawiązaniu połączenia):'));

const transactionSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ['przychod', 'wydatek'], required: true },
    category: { type: String, default: 'Bez kategorii' },
    date: { type: Date, required: true, default: Date.now }
}, { timestamps: true });
const Transaction = mongoose.model('Transaction', transactionSchema);

const budgetSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    category: { type: String, required: true },
    limit: { type: Number, required: true }
}, {
    timestamps: true,
    index: { userId: 1, category: 1 },
});
const Budget = mongoose.model('Budget', budgetSchema);

app.use(cors());
app.use(bodyParser.json());

const requireUserId = (req, res, next) => {
    const userId = req.headers['x-user-id'];
    if (!userId) {
        return res.status(400).json({ message: 'Nagłówek X-User-ID jest wymagany.' });
    }
    req.userId = userId;
    next();
};

app.use('/api', requireUserId);

app.get('/api/transactions', async (req, res) => {
    try {
        const transactions = await Transaction.find({ userId: req.userId }).sort({ date: -1 });
        res.json(transactions);
    } catch (error) {
        console.error('Błąd podczas pobierania transakcji:', error);
        res.status(500).json({ message: 'Błąd serwera podczas pobierania transakcji.' });
    }
});

app.post('/api/transactions', async (req, res) => {
    try {
        const { description, amount, type, category, date } = req.body;
        if (!description || typeof amount !== 'number' || !type || !date) {
            return res.status(400).json({ message: 'Pola opis, kwota (jako liczba), typ i data są wymagane.' });
        }
        if (amount <= 0) {
            return res.status(400).json({ message: 'Kwota musi być liczbą większą od zera.' });
        }
        if (!['przychod', 'wydatek'].includes(type)) {
            return res.status(400).json({ message: 'Typ transakcji musi być "przychod" lub "wydatek".' });
        }

        const newTransaction = new Transaction({
            userId: req.userId,
            description,
            amount,
            type,
            category: category || 'Bez kategorii',
            date: new Date(date)
        });
        await newTransaction.save();
        res.status(201).json(newTransaction);
    } catch (error) {
        console.error('Błąd podczas dodawania transakcji:', error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ message: messages.join(', ') });
        }
        res.status(500).json({ message: 'Błąd serwera podczas dodawania transakcji.' });
    }
});

app.delete('/api/transactions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Nieprawidłowe ID transakcji.' });
        }
        const deletedTransaction = await Transaction.findOneAndDelete({ _id: id, userId: req.userId });
        if (!deletedTransaction) {
            return res.status(404).json({ message: 'Nie znaleziono transakcji o podanym ID dla tego użytkownika lub transakcja nie istnieje.' });
        }
        res.json({ message: 'Transakcja usunięta pomyślnie.' });
    } catch (error) {
        console.error('Błąd podczas usuwania transakcji:', error);
        res.status(500).json({ message: 'Błąd serwera podczas usuwania transakcji.' });
    }
});

app.delete('/api/transactions', async (req, res) => {
    try {
        const result = await Transaction.deleteMany({ userId: req.userId });
        res.json({ message: `Wszystkie transakcje (${result.deletedCount}) dla użytkownika ${req.userId} zostały usunięte.` });
    } catch (error) {
        console.error('Błąd podczas usuwania wszystkich transakcji:', error);
        res.status(500).json({ message: 'Błąd serwera podczas usuwania wszystkich transakcji.' });
    }
});

app.get('/api/budgets', async (req, res) => {
    console.log(`[Backend GET /api/budgets] Próba pobrania budżetów dla userId: ${req.userId}.`);
    try {
        const budgets = await Budget.find({ userId: req.userId }).sort({ category: 1 });
        console.log(`[Backend GET /api/budgets] Pobrane budżety dla userId ${req.userId}:`, budgets);
        res.json(budgets);
    } catch (error) {
        console.error(`[Backend GET /api/budgets] Błąd podczas pobierania budżetów dla userId ${req.userId}:`, error);
        res.status(500).json({ message: 'Błąd serwera podczas pobierania budżetów.' });
    }
});

app.post('/api/budgets', async (req, res) => {
    console.log(`[Backend POST /api/budgets] Otrzymano żądanie dodania budżetu dla userId: ${req.userId}:`, req.body);
    try {
        const { category, limit } = req.body;
        if (!category || typeof limit !== 'number') {
            return res.status(400).json({ message: 'Kategoria (tekst) i limit (liczba) są wymagane.' });
        }
        if (limit <= 0) {
            return res.status(400).json({ message: 'Limit musi być liczbą większą od zera.' });
        }

        const existingBudget = await Budget.findOne({ userId: req.userId, category: { $regex: new RegExp(`^${category}$`, 'i') } });
        if (existingBudget) {
            console.log(`[Backend POST /api/budgets] Budżet dla kategorii "${category}" i userId "${req.userId}" już istnieje.`);
            return res.status(400).json({ message: `Budżet dla kategorii "${category}" już istnieje dla tego użytkownika.` });
        }

        const newBudget = new Budget({ userId: req.userId, category, limit });
        await newBudget.save();
        console.log(`[Backend POST /api/budgets] Budżet zapisany pomyślnie dla userId ${req.userId}:`, newBudget);
        res.status(201).json(newBudget);
    } catch (error) {
        console.error(`[Backend POST /api/budgets] Błąd podczas dodawania budżetu dla userId ${req.userId}:`, error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ message: messages.join(', ') });
        }
        if (error.code === 11000) {
            if (error.keyPattern && error.keyPattern.userId === 1 && error.keyPattern.category === 1) {
                return res.status(400).json({ message: `Budżet dla kategorii "${req.body.category}" już istnieje dla tego użytkownika (błąd bazy danych - duplikat).` });
            }
            return res.status(400).json({ message: `Wystąpił błąd duplikacji w bazie danych.` });
        }
        res.status(500).json({ message: 'Błąd serwera podczas dodawania budżetu.' });
    }
});


app.delete('/api/budgets/:category', async (req, res) => {
    const categoryToDelete = req.params.category;
    console.log(`[Backend DELETE /api/budgets] Próba usunięcia budżetu dla kategorii: ${categoryToDelete} i userId: ${req.userId}`);
    try {
        const deletedBudget = await Budget.findOneAndDelete({ userId: req.userId, category: { $regex: new RegExp(`^${categoryToDelete}$`, 'i') } });
        if (!deletedBudget) {
            console.log(`[Backend DELETE /api/budgets] Nie znaleziono budżetu dla kategorii: ${categoryToDelete} i userId: ${req.userId}`);
            return res.status(404).json({ message: 'Nie znaleziono budżetu dla podanej kategorii dla tego użytkownika.' });
        }
        console.log(`[Backend DELETE /api/budgets] Budżet usunięty pomyślnie dla kategorii: ${categoryToDelete} i userId: ${req.userId}`);
        res.json({ message: `Budżet dla kategorii "${deletedBudget.category}" usunięty pomyślnie.` });
    } catch (error) {
        console.error(`[Backend DELETE /api/budgets] Błąd podczas usuwania budżetu dla kategorii ${categoryToDelete} i userId ${req.userId}:`, error);
        res.status(500).json({ message: 'Błąd serwera podczas usuwania budżetu.' });
    }
});

app.listen(PORT, () => {
    console.log(`Serwer nasłuchuje na porcie ${PORT}.`);
    if (MONGODB_URI) {
        const mongoHost = MONGODB_URI.split('@')[1] ? MONGODB_URI.split('@')[1].split('/')[0] : 'nie można wyświetlić hosta (sprawdź URI)';
        console.log(`Połączony z MongoDB pod adresem: ${mongoHost}`);
    }
});
