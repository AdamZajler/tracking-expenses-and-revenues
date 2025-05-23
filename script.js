document.addEventListener('DOMContentLoaded', () => {
    const API_URL = 'http://localhost:3000/api';

    const transactionForm = document.getElementById('transactionForm');
    const transactionListElement = document.getElementById('transactionListElement');
    const transactionLoaderContainerElement = document.getElementById('transactionLoaderContainerElement');
    const balanceElement = document.getElementById('balanceElement');
    const clearAllTransactionsButton = document.getElementById('clearAllTransactionsButton');
    const notificationArea = document.getElementById('notificationArea');
    const requestNotificationPermissionButton = document.getElementById('requestNotificationPermissionButton');
    const dateInput = document.getElementById('date');

    const budgetForm = document.getElementById('budgetForm');
    const budgetListElement = document.getElementById('budgetListElement');
    const budgetLoaderContainerElement = document.getElementById('budgetLoaderContainerElement');

    const reportPeriodSelect = document.getElementById('reportPeriodSelect');
    const expensesByCategoryChartCanvas = document.getElementById('expensesByCategoryChartCanvas');
    const incomeVsExpensesChartCanvas = document.getElementById('incomeVsExpensesChartCanvas');
    const noDataExpensesMessage = document.getElementById('noDataExpensesMessage');
    const noDataIncomeMessage = document.getElementById('noDataIncomeMessage');

    let expensesByCategoryChartContext = expensesByCategoryChartCanvas ? expensesByCategoryChartCanvas.getContext('2d') : null;
    let incomeVsExpensesChartContext = incomeVsExpensesChartCanvas ? incomeVsExpensesChartCanvas.getContext('2d') : null;

    const themeSelector = document.getElementById('themeSelector');
    const bodyElement = document.body;

    const tabs = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    let localTransactions = [];
    let localBudgets = [];
    let expensesChart = null;
    let incomeExpenseChart = null;

    if (dateInput) dateInput.valueAsDate = new Date();

    function applyTheme(theme) {
        if (theme === 'dark') {
            bodyElement.classList.add('dark-mode');
        } else {
            bodyElement.classList.remove('dark-mode');
        }
        localStorage.setItem('appTheme', theme);
        if (document.getElementById('reportsTabContent').classList.contains('active')) {
            renderReports();
        }
    }

    if (themeSelector) {
        const savedTheme = localStorage.getItem('appTheme') || 'light';
        themeSelector.value = savedTheme;
        applyTheme(savedTheme);
        themeSelector.addEventListener('change', (e) => applyTheme(e.target.value));
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => {
                t.classList.remove('active-tab', 'bg-indigo-500', 'text-white');
                t.classList.add('text-indigo-600', 'hover:bg-indigo-100');
            });
            tab.classList.add('active-tab', 'bg-indigo-500', 'text-white');
            tab.classList.remove('text-indigo-600', 'hover:bg-indigo-100');

            const targetTabDataset = tab.dataset.tab;
            let targetTabId = `${targetTabDataset}TabContent`;
            // transactionsTabContent ID is an exception in naming pattern, handle it.
            if (targetTabDataset === "transactions") {
                targetTabId = "transactionsTabContent";
            }


            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === targetTabId) {
                    content.classList.add('active');
                    if (targetTabDataset === 'transactions') fetchAndRenderTransactions();
                    if (targetTabDataset === 'budget') fetchAndRenderBudgets();
                    if (targetTabDataset === 'reports') renderReports();
                }
            });
        });
    });

    // Ensure the default active tab's content is shown
    const activeTabButton = document.querySelector('.tab-button.active-tab');
    if (activeTabButton) {
        const activeTabDataset = activeTabButton.dataset.tab;
        let activeTabContentId = `${activeTabDataset}TabContent`;
        if (activeTabDataset === "transactions") {
            activeTabContentId = "transactionsTabContent";
        }
        const activeContent = document.getElementById(activeTabContentId);
        if (activeContent) {
            activeContent.classList.add('active');
        }
    }


    function showToast(message, type = 'success', duration = 3000) {
        notificationArea.textContent = message;
        notificationArea.className = 'notification show';
        if (type === 'error') notificationArea.classList.add('error');
        else notificationArea.classList.remove('error');
        setTimeout(() => notificationArea.classList.remove('show'), duration);
    }

    async function fetchTransactions() {
        console.log("[FRONTEND] fetchTransactions: Rozpoczęcie pobierania transakcji...");
        if (transactionLoaderContainerElement) transactionLoaderContainerElement.style.display = 'block';
        if (transactionListElement) transactionListElement.innerHTML = '';

        try {
            const response = await fetch(`${API_URL}/transactions`);
            console.log('[FRONTEND] fetchTransactions: Status odpowiedzi serwera:', response.status);
            if (!response.ok) {
                const errorText = await response.text();
                console.error('[FRONTEND] fetchTransactions: Błąd odpowiedzi serwera (tekst):', errorText);
                throw new Error(`Błąd HTTP! Status: ${response.status}, Wiadomość: ${errorText}`);
            }
            const data = await response.json();
            console.log('[FRONTEND] fetchTransactions: Otrzymane dane (surowe):', data);

            if (Array.isArray(data)) {
                localTransactions = data;
                console.log('[FRONTEND] fetchTransactions: localTransactions zaktualizowane danymi z serwera.');
            } else {
                console.error('[FRONTEND] fetchTransactions: Otrzymane dane nie są tablicą:', data);
                localTransactions = [];
                showToast('Otrzymano niepoprawne dane transakcji z serwera.', 'error');
            }
        } catch (error) {
            console.error("[FRONTEND] fetchTransactions: Wystąpił błąd podczas pobierania:", error);
            showToast('Nie udało się pobrać transakcji. Sprawdź połączenie i spróbuj ponownie.', 'error');
            localTransactions = [];
        } finally {
            if (transactionLoaderContainerElement) transactionLoaderContainerElement.style.display = 'none';
            console.log("[FRONTEND] fetchTransactions: Zakończono próbę pobierania. Aktualny stan localTransactions:", JSON.parse(JSON.stringify(localTransactions)));
        }
    }

    function renderTransactions() {
        console.log('[FRONTEND] renderTransactions: Rozpoczęcie renderowania. Aktualny stan localTransactions:', JSON.parse(JSON.stringify(localTransactions)));
        if (!transactionListElement) {
            console.error("[FRONTEND] renderTransactions: Element listy transakcji (transactionListElement) nie został znaleziony!");
            if (transactionLoaderContainerElement) transactionLoaderContainerElement.style.display = 'none';
            return;
        }
        if (transactionLoaderContainerElement) transactionLoaderContainerElement.style.display = 'none';
        transactionListElement.innerHTML = '';

        if (!Array.isArray(localTransactions) || localTransactions.length === 0) {
            console.log('[FRONTEND] renderTransactions: Brak transakcji do wyświetlenia lub localTransactions nie jest tablicą. Wyświetlanie komunikatu "Brak transakcji".');
            transactionListElement.innerHTML = '<li class="text-gray-500 text-center py-4">Brak transakcji. Dodaj pierwszą!</li>';
            updateBalance();
            return;
        }

        console.log(`[FRONTEND] renderTransactions: Przetwarzanie ${localTransactions.length} transakcji.`);
        try {
            const sortedTransactions = [...localTransactions].sort((a, b) => {
                const dateA = new Date(a.date);
                const dateB = new Date(b.date);
                if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
                if (isNaN(dateA.getTime())) return 1;
                if (isNaN(dateB.getTime())) return -1;
                return dateB - dateA;
            });

            sortedTransactions.forEach((transaction, index) => {
                console.log(`[FRONTEND] renderTransactions: Przetwarzanie transakcji (index ${index}):`, JSON.parse(JSON.stringify(transaction)));
                if (!transaction || typeof transaction.type !== 'string' || typeof transaction.amount !== 'number' || !transaction._id) {
                    console.warn(`[FRONTEND] renderTransactions: Nieprawidłowy lub niekompletny obiekt transakcji (index ${index}):`, transaction);
                    return;
                }

                const li = document.createElement('li');
                li.classList.add('flex', 'justify-between', 'items-center', 'p-3', 'rounded-md', 'shadow-sm');

                if (transaction.type === 'przychod') {
                    li.classList.add('bg-green-100', 'border-green-500');
                } else {
                    li.classList.add('bg-red-100', 'border-red-500');
                }
                li.classList.add('border-l-4');

                const amountSign = transaction.type === 'przychod' ? '+' : '-';
                const amountColor = transaction.type === 'przychod' ? 'text-green-700' : 'text-red-700';
                const desc = transaction.description || "Brak opisu";
                const cat = transaction.category || "Bez kategorii";
                const dateStr = transaction.date ? new Date(transaction.date).toLocaleDateString('pl-PL') : "Brak daty";
                const amountVal = parseFloat(transaction.amount).toFixed(2);

                li.innerHTML = `
                        <div class="flex-grow">
                            <span class="font-semibold text-gray-800">${desc}</span>
                            <span class="block text-xs text-gray-500">${cat} - ${dateStr}</span>
                        </div>
                        <div class="text-right">
                            <span class="font-bold ${amountColor} text-lg">${amountSign}${amountVal} PLN</span>
                            <button data-id="${transaction._id}" class="delete-btn text-gray-400 hover:text-red-600 ml-2 sm:ml-4 text-xs focus:outline-none">
                                <i class="fas fa-trash-alt"></i> Usuń
                            </button>
                        </div>`;
                transactionListElement.appendChild(li);
                console.log(`[FRONTEND] renderTransactions: Dodano element dla transakcji ID ${transaction._id}`);
            });
        } catch (error) {
            console.error("[FRONTEND] renderTransactions: Wystąpił błąd podczas tworzenia lub dodawania elementów transakcji:", error);
            showToast('Błąd podczas wyświetlania listy transakcji.', 'error');
        }

        updateBalance();
        addDeleteEventListeners();
        console.log('[FRONTEND] renderTransactions: Zakończono renderowanie.');
    }

    async function fetchAndRenderTransactions() {
        console.log("[FRONTEND] fetchAndRenderTransactions: Wywołano.");
        await fetchTransactions();
        renderTransactions();
        if (document.getElementById('reportsTabContent').classList.contains('active')) {
            renderReports();
        }
    }

    function updateBalance() {
        const total = localTransactions.reduce((acc, t) => {
            const amount = parseFloat(t.amount);
            return acc + (t.type === 'przychod' ? (isNaN(amount) ? 0 : amount) : (isNaN(amount) ? 0 : -amount));
        }, 0);
        balanceElement.textContent = `${total.toFixed(2)} PLN`;
        balanceElement.className = 'font-semibold ';
        if (total < 0) balanceElement.classList.add('text-red-600');
        else if (total > 0) balanceElement.classList.add('text-green-600');
        else balanceElement.classList.add('text-indigo-600');
    }

    function addDeleteEventListeners() {
        document.querySelectorAll('.delete-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                const transactionId = e.target.closest('button').dataset.id;
                if (confirm('Czy na pewno chcesz usunąć tę transakcję?')) {
                    try {
                        const response = await fetch(`${API_URL}/transactions/${transactionId}`, { method: 'DELETE' });
                        if (!response.ok) throw new Error('Nie udało się usunąć transakcji.');
                        showToast('Transakcja usunięta.', 'success');
                        fetchAndRenderAll();
                    } catch (error) {
                        console.error("Błąd podczas usuwania transakcji:", error);
                        showToast(error.message || 'Błąd serwera przy usuwaniu.', 'error');
                    }
                }
            });
        });
    }

    if (transactionForm) {
        transactionForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const description = document.getElementById('description').value.trim();
            const amountInput = document.getElementById('amount').value;
            const type = document.getElementById('type').value;
            const category = document.getElementById('category').value.trim() || 'Bez kategorii';
            const date = document.getElementById('date').value;
            const amount = parseFloat(amountInput);
            if (!description || !amountInput || !type || !date) {
                showToast('Wszystkie pola (opis, kwota, typ, data) są wymagane!', 'error'); return;
            }
            if (isNaN(amount) || amount <= 0) {
                showToast('Kwota musi być poprawną liczbą większą od zera.', 'error'); return;
            }
            const newTransaction = { description, amount, type, category, date };
            try {
                const response = await fetch(`${API_URL}/transactions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newTransaction)
                });
                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.message || 'Nie udało się dodać transakcji.');
                }
                showToast('Transakcja dodana pomyślnie!', 'success');
                transactionForm.reset();
                document.getElementById('date').valueAsDate = new Date();
                fetchAndRenderAll();
                if (Notification.permission === "granted") {
                    new Notification("Nowa transakcja", {
                        body: `${type === 'przychod' ? 'Przychód' : 'Wydatek'}: ${description}, ${amount.toFixed(2)} PLN`,
                        icon: type === 'przychod' ? './icons/icon-192x192.png' : './icons/icon-expense-192.png'
                    });
                    if (type === 'wydatek') checkBudgetAlerts(category, amount);
                }
            } catch (error) {
                console.error("Błąd podczas dodawania transakcji:", error);
                showToast(error.message || 'Błąd serwera przy dodawaniu.', 'error');
            }
        });
    }

    if (clearAllTransactionsButton) {
        clearAllTransactionsButton.addEventListener('click', async () => {
            if (localTransactions.length > 0 && confirm('Czy na pewno chcesz usunąć WSZYSTKIE transakcje? Tej operacji nie można cofnąć.')) {
                try {
                    const response = await fetch(`${API_URL}/transactions`, { method: 'DELETE' });
                    if (!response.ok) throw new Error('Nie udało się usunąć wszystkich transakcji.');
                    showToast('Wszystkie transakcje zostały usunięte.', 'success');
                    fetchAndRenderAll();
                } catch (error) {
                    console.error("Błąd podczas usuwania wszystkich transakcji:", error);
                    showToast(error.message || 'Błąd serwera.', 'error');
                }
            } else if (localTransactions.length === 0) {
                showToast('Brak transakcji do usunięcia.', 'error');
            }
        });
    }

    async function fetchBudgets() {
        console.log("[FRONTEND] fetchBudgets: Rozpoczęcie pobierania budżetów...");
        if(budgetLoaderContainerElement) budgetLoaderContainerElement.style.display = 'block';
        if(budgetListElement) budgetListElement.innerHTML = '';

        try {
            const response = await fetch(`${API_URL}/budgets`);
            console.log('[FRONTEND] fetchBudgets: Status odpowiedzi serwera:', response.status);
            if (!response.ok) {
                const errorText = await response.text();
                console.error('[FRONTEND] fetchBudgets: Błąd odpowiedzi serwera (tekst):', errorText);
                throw new Error(`Błąd HTTP! Status: ${response.status}, Wiadomość: ${errorText}`);
            }
            const data = await response.json();
            console.log('[FRONTEND] fetchBudgets: Otrzymane dane (surowe):', data);
            localBudgets = Array.isArray(data) ? data : [];
            console.log('[FRONTEND] fetchBudgets: localBudgets zaktualizowane:', JSON.parse(JSON.stringify(localBudgets)));
        } catch (error) {
            console.error("[FRONTEND] fetchBudgets: Wystąpił błąd:", error);
            showToast('Nie udało się pobrać budżetów.', 'error');
            localBudgets = [];
        } finally {
            if(budgetLoaderContainerElement) budgetLoaderContainerElement.style.display = 'none';
            console.log("[FRONTEND] fetchBudgets: Zakończono próbę pobierania.");
        }
    }

    function renderBudgets() {
        console.log('[FRONTEND] renderBudgets: Rozpoczęcie. Aktualny stan localBudgets:', JSON.parse(JSON.stringify(localBudgets)));
        if (!budgetListElement) {
            console.error("[FRONTEND] renderBudgets: Element listy budżetów (budgetListElement) nie znaleziony!");
            if(budgetLoaderContainerElement) budgetLoaderContainerElement.style.display = 'none';
            return;
        }
        if(budgetLoaderContainerElement) budgetLoaderContainerElement.style.display = 'none';
        budgetListElement.innerHTML = '';
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();

        if (!Array.isArray(localBudgets) || localBudgets.length === 0) {
            console.log('[FRONTEND] renderBudgets: Brak budżetów do wyświetlenia. Wyświetlanie komunikatu.');
            budgetListElement.innerHTML = '<li class="text-gray-500 text-center py-4">Brak zdefiniowanych budżetów. Dodaj pierwszy!</li>';
            return;
        }

        console.log(`[FRONTEND] renderBudgets: Przetwarzanie ${localBudgets.length} budżetów.`);
        localBudgets.forEach((budget, index) => {
            console.log(`[FRONTEND] renderBudgets: Przetwarzanie budżetu (index ${index}):`, JSON.parse(JSON.stringify(budget)));
            if (!budget || typeof budget.category !== 'string' || typeof budget.limit !== 'number') {
                console.warn(`[FRONTEND] renderBudgets: Nieprawidłowy obiekt budżetu (index ${index}):`, budget);
                return;
            }

            const spentThisMonth = localTransactions
                .filter(t => t.type === 'wydatek' && t.category && budget.category && t.category.toLowerCase() === budget.category.toLowerCase() &&
                    new Date(t.date).getMonth() === currentMonth &&
                    new Date(t.date).getFullYear() === currentYear)
                .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
            const budgetLimit = parseFloat(budget.limit) || 0;
            const percentageSpent = budgetLimit > 0 ? (spentThisMonth / budgetLimit) * 100 : 0;
            const remaining = budgetLimit - spentThisMonth;
            const li = document.createElement('li');
            li.classList.add('p-4', 'bg-gray-50', 'rounded-lg', 'shadow');
            let progressBarClass = 'progress-bar';
            if (percentageSpent > 100) progressBarClass += ' danger';
            else if (percentageSpent >= 80) progressBarClass += ' warning';
            li.innerHTML = `
                    <div class="flex justify-between items-center mb-2">
                        <span class="font-semibold text-lg text-indigo-700">${budget.category}</span>
                        <button data-id="${budget._id || budget.category}" data-category="${budget.category}" class="delete-budget-btn text-gray-400 hover:text-red-600 text-xs focus:outline-none">
                            <i class="fas fa-trash-alt"></i> Usuń
                        </button>
                    </div>
                    <div class="text-sm text-gray-600 mb-1">
                        Limit: ${budgetLimit.toFixed(2)} PLN | Wydano: ${spentThisMonth.toFixed(2)} PLN | Pozostało: ${remaining.toFixed(2)} PLN
                    </div>
                    <div class="progress-bar-container">
                        <div class="${progressBarClass}" style="width: ${Math.min(percentageSpent, 100)}%;">${percentageSpent.toFixed(0)}%</div>
                    </div>`;
            budgetListElement.appendChild(li);
            console.log(`[FRONTEND] renderBudgets: Dodano element dla budżetu ${budget.category}`);
        });
        addDeleteBudgetEventListeners();
        console.log('[FRONTEND] renderBudgets: Zakończono renderowanie.');
    }

    async function fetchAndRenderBudgets() {
        console.log("[FRONTEND] fetchAndRenderBudgets: Wywołano.");
        await fetchBudgets();
        renderBudgets();
        if (document.getElementById('reportsTabContent').classList.contains('active')) {
            renderReports();
        }
    }

    function addDeleteBudgetEventListeners() {
        document.querySelectorAll('.delete-budget-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                const budgetCategory = e.target.closest('button').dataset.category;
                if (confirm(`Czy na pewno chcesz usunąć budżet dla kategorii "${budgetCategory}"?`)) {
                    try {
                        const response = await fetch(`${API_URL}/budgets/${encodeURIComponent(budgetCategory)}`, { method: 'DELETE' });
                        if (!response.ok) throw new Error('Nie udało się usunąć budżetu.');
                        showToast('Budżet usunięty.', 'success');
                        fetchAndRenderBudgets();
                    } catch (error) {
                        console.error("Błąd podczas usuwania budżetu:", error);
                        showToast(error.message || 'Błąd serwera.', 'error');
                    }
                }
            });
        });
    }

    if (budgetForm) {
        budgetForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const category = document.getElementById('budgetCategory').value.trim();
            const limitInput = document.getElementById('budgetLimit').value;
            const limit = parseFloat(limitInput);
            if (!category || !limitInput) {
                showToast('Kategoria i limit są wymagane.', 'error'); return;
            }
            if (isNaN(limit) || limit <= 0) {
                showToast('Limit musi być poprawną liczbą większą od zera.', 'error'); return;
            }
            const newBudget = { category, limit };
            console.log("[FRONTEND] budgetForm submit: Próba dodania budżetu:", newBudget);
            try {
                const response = await fetch(`${API_URL}/budgets`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newBudget)
                });
                console.log('[FRONTEND] budgetForm submit: Status odpowiedzi serwera:', response.status);
                if (!response.ok) {
                    const errData = await response.json();
                    console.error('[FRONTEND] budgetForm submit: Błąd odpowiedzi serwera:', errData);
                    throw new Error(errData.message || 'Nie udało się dodać budżetu.');
                }
                showToast('Budżet dodany pomyślnie!', 'success');
                budgetForm.reset();
                fetchAndRenderBudgets();
            } catch (error) {
                console.error("[FRONTEND] budgetForm submit: Wystąpił błąd:", error);
                showToast(error.message || 'Błąd serwera.', 'error');
            }
        });
    }

    function checkBudgetAlerts(category, amount) {
        const budget = localBudgets.find(b => b.category.toLowerCase() === category.toLowerCase());
        if (!budget) return;
        const budgetLimit = parseFloat(budget.limit);
        if (isNaN(budgetLimit) || budgetLimit <= 0) return;
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        const spentThisMonth = localTransactions
            .filter(t => t.type === 'wydatek' && t.category.toLowerCase() === category.toLowerCase() &&
                new Date(t.date).getMonth() === currentMonth &&
                new Date(t.date).getFullYear() === currentYear)
            .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
        const percentageSpent = (spentThisMonth / budgetLimit) * 100;
        const spentBeforeThisTransaction = spentThisMonth - amount;
        const percentageSpentBeforeThisTransaction = (spentBeforeThisTransaction / budgetLimit) * 100;
        let alertMessage = null;
        if (percentageSpent >= 100 && percentageSpentBeforeThisTransaction < 100) {
            alertMessage = `Przekroczono budżet (${budgetLimit.toFixed(2)} PLN) dla kategorii "${category}"! Wydano ${spentThisMonth.toFixed(2)} PLN.`;
        } else if (percentageSpent >= 80 && percentageSpentBeforeThisTransaction < 80) {
            alertMessage = `Uwaga! Wydano ${percentageSpent.toFixed(0)}% budżetu (${budgetLimit.toFixed(2)} PLN) dla kategorii "${category}".`;
        }
        if (alertMessage && Notification.permission === "granted") {
            new Notification("Alert Budżetowy", { body: alertMessage, icon: './icons/icon-expense-192.png' });
        }
    }

    function getFilteredTransactionsForReport() {
        const period = reportPeriodSelect.value;
        const now = new Date();
        let startDate, endDate;
        if (period === 'currentMonth') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        } else if (period === 'lastMonth') {
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        } else {
            return localTransactions;
        }
        return localTransactions.filter(t => {
            const tDate = new Date(t.date);
            return !isNaN(tDate.getTime()) && tDate >= startDate && tDate <= endDate;
        });
    }

    function renderReports() {
        if (!expensesByCategoryChartContext || !incomeVsExpensesChartContext || !noDataExpensesMessage || !noDataIncomeMessage) {
            if (expensesByCategoryChartCanvas) expensesByCategoryChartContext = expensesByCategoryChartCanvas.getContext('2d');
            if (incomeVsExpensesChartCanvas) incomeVsExpensesChartContext = incomeVsExpensesChartCanvas.getContext('2d');
            if (!expensesByCategoryChartContext || !incomeVsExpensesChartContext) { // Still no context
                console.error("Nie można zainicjować kontekstów wykresów.");
                return;
            }
        }
        if (expensesChart) { expensesChart.destroy(); expensesChart = null; }
        if (incomeExpenseChart) { incomeExpenseChart.destroy(); incomeExpenseChart = null; }
        if (typeof Chart === 'undefined') {
            showToast('Błąd ładowania biblioteki wykresów.', 'error', 5000);
            if(expensesByCategoryChartCanvas) expensesByCategoryChartCanvas.style.display = 'none';
            noDataExpensesMessage.textContent = 'Błąd ładowania biblioteki wykresów.';
            noDataExpensesMessage.style.display = 'block';
            if(incomeVsExpensesChartCanvas) incomeVsExpensesChartCanvas.style.display = 'none';
            noDataIncomeMessage.textContent = 'Błąd ładowania biblioteki wykresów.';
            noDataIncomeMessage.style.display = 'block';
            return;
        }
        const isDarkMode = bodyElement.classList.contains('dark-mode');
        const gridColor = isDarkMode ? 'rgba(107, 114, 128, 0.5)' : 'rgba(0, 0, 0, 0.1)';
        const ticksColor = isDarkMode ? '#9ca3af' : '#666';
        const legendColor = isDarkMode ? '#d1d5db' : '#333';

        const filteredTransactions = getFilteredTransactionsForReport();
        const expensesByCat = filteredTransactions
            .filter(t => t.type === 'wydatek')
            .reduce((acc, t) => {
                const amount = parseFloat(t.amount) || 0;
                acc[t.category] = (acc[t.category] || 0) + amount;
                return acc;
            }, {});

        if (Object.keys(expensesByCat).length > 0 && Object.values(expensesByCat).some(v => v > 0)) {
            if(expensesByCategoryChartCanvas) expensesByCategoryChartCanvas.style.display = 'block';
            noDataExpensesMessage.style.display = 'none';
            expensesChart = new Chart(expensesByCategoryChartContext, {
                type: 'pie',
                data: {
                    labels: Object.keys(expensesByCat),
                    datasets: [{
                        data: Object.values(expensesByCat),
                        backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF'],
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: legendColor } } }
                }
            });
        } else {
            if(expensesByCategoryChartCanvas) expensesByCategoryChartCanvas.style.display = 'none';
            noDataExpensesMessage.textContent = 'Brak danych wydatków do wyświetlenia dla wybranego okresu.';
            noDataExpensesMessage.style.display = 'block';
        }
        const totalIncome = filteredTransactions.filter(t => t.type === 'przychod').reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
        const totalExpenses = Object.values(expensesByCat).reduce((sum, v) => sum + v, 0);
        if (totalIncome > 0 || totalExpenses > 0) {
            if(incomeVsExpensesChartCanvas) incomeVsExpensesChartCanvas.style.display = 'block';
            noDataIncomeMessage.style.display = 'none';
            incomeExpenseChart = new Chart(incomeVsExpensesChartContext, {
                type: 'bar',
                data: {
                    labels: ['Finanse'],
                    datasets: [
                        { label: 'Przychody', data: [totalIncome], backgroundColor: 'rgba(75, 192, 192, 0.6)' },
                        { label: 'Wydatki', data: [totalExpenses], backgroundColor: 'rgba(255, 99, 132, 0.6)' }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: legendColor } } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: ticksColor } },
                        x: { grid: { color: gridColor }, ticks: { color: ticksColor } }
                    }
                }
            });
        } else {
            if(incomeVsExpensesChartCanvas) incomeVsExpensesChartCanvas.style.display = 'none';
            noDataIncomeMessage.textContent = 'Brak danych o przychodach/wydatkach dla wybranego okresu.';
            noDataIncomeMessage.style.display = 'block';
        }
    }

    if (reportPeriodSelect) {
        reportPeriodSelect.addEventListener('change', renderReports);
    }

    if (requestNotificationPermissionButton) {
        requestNotificationPermissionButton.addEventListener('click', () => {
            if (!("Notification" in window)) {
                showToast("Twoja przeglądarka nie wspiera powiadomień.", "error");
            } else if (Notification.permission === "granted") {
                showToast("Powiadomienia są już włączone.", "success");
                new Notification("Testowe powiadomienie", { body: "Powiadomienia działają!", icon: './icons/icon-192x192.png' });
            } else if (Notification.permission !== "denied") {
                Notification.requestPermission().then(permission => {
                    if (permission === "granted") {
                        showToast("Powiadomienia włączone!", "success");
                        new Notification("Dziękujemy!", { body: "Powiadomienia zostały aktywowane.", icon: './icons/icon-192x192.png' });
                    } else {
                        showToast("Nie udzielono pozwolenia na powiadomienia.", "error");
                    }
                });
            } else {
                showToast("Powiadomienia zablokowane. Zmień ustawienia przeglądarki.", "error");
            }
        });
    }

    async function fetchAndRenderAll() {
        console.log("[FRONTEND] fetchAndRenderAll: Inicjalizacja danych aplikacji.");
        await fetchAndRenderTransactions();
        await fetchAndRenderBudgets();
        console.log("[FRONTEND] fetchAndRenderAll: Zakończono inicjalizację.");
    }

    fetchAndRenderAll();

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('service-worker.js')
                .then(registration => console.log('ServiceWorker zarejestrowany pomyślnie: ', registration.scope))
                .catch(error => console.log('Rejestracja ServiceWorkera nie powiodła się: ', error));
        });
    }
});