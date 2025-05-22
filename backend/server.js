const cors = require('cors');
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

mongoose.connect('mongodb://localhost:27017/finansePWA', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'Błąd połączenia z MongoDB:'));
db.once('open', () => {
    console.log('Połączono z bazą danych MongoDB.');
});

const userSchema = new mongoose.Schema({
    username: String,
    password: String
});
const User = mongoose.model('User', userSchema);

const transactionSchema = new mongoose.Schema({
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ['przychod', 'wydatek'], required: true },
    category: { type: String, default: 'Bez kategorii' },
    date: { type: Date, required: true, default: Date.now }
}, { timestamps: true });
const Transaction = mongoose.model('Transaction', transactionSchema);

const budgetSchema = new mongoose.Schema({
    category: { type: String, required: true, unique: true },
    limit: { type: Number, required: true }
}, { timestamps: true });
const Budget = mongoose.model('Budget', budgetSchema);

app.use(cors());
app.use(bodyParser.json());

app.post('/api/users', async (req, res) => {
    const { username, password } = req.body;
    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: 'Użytkownik już istnieje.' });
        }
        const newUser = new User({ username, password });
        await newUser.save();
        res.status(201).json({ message: 'Utworzono nowego użytkownika.' });
    } catch (error) {
        console.error('Błąd podczas tworzenia użytkownika:', error);
        res.status(500).json({ message: 'Wystąpił błąd podczas tworzenia użytkownika.' });
    }
});

app.get('/api/transactions', async (req, res) => {
    try {
        const transactions = await Transaction.find().sort({ date: -1 });
        res.json(transactions);
    } catch (error) {
        console.error('Błąd podczas pobierania transakcji:', error);
        res.status(500).json({ message: 'Błąd serwera podczas pobierania transakcji.' });
    }
});

app.post('/api/transactions', async (req, res) => {
    try {
        const { description, amount, type, category, date } = req.body;
        if (!description || amount === undefined || !type || !date) {
            return res.status(400).json({ message: 'Opis, kwota, typ i data są wymagane.' });
        }
        if (typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ message: 'Kwota musi być liczbą większą od zera.' });
        }
        const newTransaction = new Transaction({
            description,
            amount,
            type,
            category: category || 'Bez kategorii', // Użycie polskiego domyślnego, jak w schemacie
            date: new Date(date)
        });
        await newTransaction.save();
        res.status(201).json(newTransaction);
    } catch (error) {
        console.error('Błąd podczas dodawania transakcji:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
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
        const deletedTransaction = await Transaction.findByIdAndDelete(id);
        if (!deletedTransaction) {
            return res.status(404).json({ message: 'Nie znaleziono transakcji.' });
        }
        res.json({ message: 'Transakcja usunięta pomyślnie.' });
    } catch (error) {
        console.error('Błąd podczas usuwania transakcji:', error);
        res.status(500).json({ message: 'Błąd serwera podczas usuwania transakcji.' });
    }
});

app.delete('/api/transactions', async (req, res) => {
    try {
        await Transaction.deleteMany({});
        res.json({ message: 'Wszystkie transakcje zostały usunięte.' });
    } catch (error) {
        console.error('Błąd podczas usuwania wszystkich transakcji:', error);
        res.status(500).json({ message: 'Błąd serwera podczas usuwania wszystkich transakcji.' });
    }
});


app.get('/api/budgets', async (req, res) => {
    console.log('[Backend GET /api/budgets] Attempting to fetch budgets.');
    try {
        const budgets = await Budget.find().sort({ category: 1 });
        console.log('[Backend GET /api/budgets] Fetched budgets:', budgets);
        res.json(budgets);
    } catch (error) {
        console.error('[Backend GET /api/budgets] Błąd podczas pobierania budżetów:', error);
        res.status(500).json({ message: 'Błąd serwera podczas pobierania budżetów.' });
    }
});

app.post('/api/budgets', async (req, res) => {
    console.log('[Backend POST /api/budgets] Received request to add budget:', req.body);
    try {
        const { category, limit } = req.body;
        if (!category || limit === undefined) {
            return res.status(400).json({ message: 'Kategoria i limit są wymagane.' });
        }
        if (typeof limit !== 'number' || limit <= 0) {
            return res.status(400).json({ message: 'Limit musi być liczbą większą od zera.' });
        }
        const existingBudget = await Budget.findOne({ category: { $regex: new RegExp(`^${category}$`, 'i') } });
        if (existingBudget) {
            console.log(`[Backend POST /api/budgets] Budget for category "${category}" already exists.`);
            return res.status(400).json({ message: `Budżet dla kategorii "${category}" już istnieje.` });
        }
        const newBudget = new Budget({ category, limit });
        await newBudget.save();
        console.log('[Backend POST /api/budgets] Budget saved successfully:', newBudget);
        res.status(201).json(newBudget);
    } catch (error) {
        console.error('[Backend POST /api/budgets] Błąd podczas dodawania budżetu:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: 'Błąd serwera podczas dodawania budżetu.' });
    }
});

app.delete('/api/budgets/:category', async (req, res) => {
    const categoryToDelete = req.params.category;
    console.log(`[Backend DELETE /api/budgets] Attempting to delete budget for category: ${categoryToDelete}`);
    try {
        const deletedBudget = await Budget.findOneAndDelete({ category: categoryToDelete });
        if (!deletedBudget) {
            console.log(`[Backend DELETE /api/budgets] Budget not found for category: ${categoryToDelete}`);
            return res.status(404).json({ message: 'Nie znaleziono budżetu dla podanej kategorii.' });
        }
        console.log(`[Backend DELETE /api/budgets] Budget deleted successfully for category: ${categoryToDelete}`);
        res.json({ message: `Budżet dla kategorii "${categoryToDelete}" usunięty pomyślnie.` });
    } catch (error) {
        console.error(`[Backend DELETE /api/budgets] Błąd podczas usuwania budżetu dla kategorii ${categoryToDelete}:`, error);
        res.status(500).json({ message: 'Błąd serwera podczas usuwania budżetu.' });
    }
});

app.listen(PORT, () => {
    console.log(`Serwer nasłuchuje na porcie ${PORT}.`);
});