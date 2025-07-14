// --- DOM Elements ---
const searchInput = document.getElementById('searchInput');
const searchResultsContainer = document.getElementById('searchResults');
const requestList = document.getElementById('requestList');
const requestTable = document.getElementById('requestTable');
const emptyListMessage = document.getElementById('emptyListMessage');
const submitRequestBtn = document.getElementById('submitRequestBtn');
const submitBtnText = document.getElementById('submitBtnText');
const loadingSpinner = document.getElementById('loadingSpinner');
const historyContainer = document.getElementById('historyContainer');
const formTitle = document.getElementById('formTitle');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const customModal = document.getElementById('customModal');
const modalTitle = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');
const modalButtons = document.getElementById('modalButtons');
const historySearchInput = document.getElementById('historySearchInput');
const showDeletedCheckbox = document.getElementById('showDeletedCheckbox');

// --- State ---
let searchTimeout;
let requestItems = [];
let requestHistory = []; 
let isEditing = false;
let editingControlNumber = null;
let currentSearchResults = [];

// --- Modal Logic ---
let confirmResolve = null;

function showModal(title, message, type = 'alert') {
    modalTitle.textContent = title;
    modalMessage.innerHTML = message; // Use innerHTML to allow for line breaks
    modalButtons.innerHTML = ''; // Clear previous buttons

    if (type === 'confirm') {
        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = 'Confirm';
        confirmBtn.className = 'bg-red-600 text-white font-bold py-2 px-5 rounded-full hover:bg-red-700 transition';
        confirmBtn.onclick = () => {
            hideModal();
            if (confirmResolve) confirmResolve(true);
        };
        
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'bg-slate-200 text-slate-800 font-bold py-2 px-5 rounded-full hover:bg-slate-300 transition';
        cancelBtn.onclick = () => {
            hideModal();
            if (confirmResolve) confirmResolve(false);
        };
        
        modalButtons.appendChild(cancelBtn);
        modalButtons.appendChild(confirmBtn);

    } else { // Alert
        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.className = 'bg-indigo-600 text-white font-bold py-2 px-5 rounded-full hover:bg-indigo-700 transition';
        okBtn.onclick = hideModal;
        modalButtons.appendChild(okBtn);
    }

    customModal.classList.remove('hidden');
    setTimeout(() => {
        customModal.classList.remove('opacity-0');
        customModal.querySelector('.modal-content').classList.remove('scale-95');
    }, 10);
}

function hideModal() {
    customModal.classList.add('opacity-0');
    customModal.querySelector('.modal-content').classList.add('scale-95');
    setTimeout(() => {
        customModal.classList.add('hidden');
        if (confirmResolve) {
            confirmResolve(false); // Resolve with false if modal is closed without a button click
            confirmResolve = null;
        }
    }, 200);
}

function showCustomConfirm(title, message) {
    return new Promise(resolve => {
        confirmResolve = resolve;
        showModal(title, message, 'confirm');
    });
}

// --- Helper Functions ---
const formatPrice = (number) => (number || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDate = (dateString) => new Date(dateString).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// --- Search Functionality ---
searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const query = searchInput.value.trim();
    if (query.length < 3) {
        searchResultsContainer.classList.add('hidden');
        return;
    }
    loadingSpinner.classList.remove('hidden');
    searchTimeout = setTimeout(() => {
        fetch(`/keyword-search?query=${encodeURIComponent(query)}`)
            .then(response => response.json())
            .then(data => {
                if (data && Array.isArray(data)) data.sort((a, b) => a.unit_cost - b.unit_cost);
                currentSearchResults = data || [];
                renderSearchResults(currentSearchResults);
                searchResultsContainer.classList.remove('hidden');
                searchResultsContainer.scrollTop = 0;
            })
            .catch(error => console.error('Error fetching search results:', error))
            .finally(() => loadingSpinner.classList.add('hidden'));
    }, 500);
});

// --- Click away to close search results ---
document.addEventListener('click', (e) => {
    const formSection = document.getElementById('requestFormSection');
    if (!formSection.contains(e.target)) {
        searchResultsContainer.classList.add('hidden');
    }
});

function renderSearchResults(results) {
    searchResultsContainer.innerHTML = ''; // Clear previous results
    if (!results || results.length === 0) {
        searchResultsContainer.innerHTML = '<div class="p-4 text-slate-500">No results found.</div>';
        return;
    }
    
    const itemsHtml = results.map(item => {
        const isAdded = requestItems.some(reqItem => reqItem.item_description === item.item_description && reqItem.item_brand === item.item_brand);
        
        const buttonHtml = isAdded 
            ? `<button class="add-item-btn bg-slate-200 text-slate-500 text-xs font-bold py-1 px-3 rounded-full cursor-not-allowed" disabled>Added</button>`
            : `<button class="add-item-btn bg-indigo-500 text-white text-xs font-bold py-1 px-3 rounded-full hover:bg-indigo-600 transition ml-4" data-item='${JSON.stringify(item)}'>Add</button>`;

        return `
            <div class="search-result-item p-4 border-b border-slate-100 last:border-b-0 flex justify-between items-center">
                <div class="item-details flex-grow ${isAdded ? 'cursor-default' : 'cursor-pointer'} pr-4">
                    <p class="font-medium text-slate-800 pointer-events-none">${item.item_description}</p>
                    <p class="text-sm text-slate-500 pointer-events-none">
                        ${item.item_brand || 'N/A'} - ${item.supplier || 'N/A'}
                        <span class="text-xs text-slate-500 font-mono ml-2 pointer-events-none">- P${formatPrice(item.unit_cost)}</span>
                    </p>
                </div>
                ${buttonHtml}
            </div>
        `;
    }).join('');

    const footerHtml = `
        <div class="sticky bottom-0 p-4 bg-gradient-to-t from-white to-transparent text-right">
            <button id="closeSearchBtn" class="bg-slate-700 text-white font-bold py-3 px-6 rounded-full hover:bg-slate-800 transition-all shadow-lg transform hover:scale-105" title="Close Search">
                Exit
            </button>
        </div>
    `;

    searchResultsContainer.innerHTML = itemsHtml + footerHtml;
}

// --- Request List Management ---
searchResultsContainer.addEventListener('click', (e) => {
    // Handle close button click
    if (e.target.closest('#closeSearchBtn')) {
        searchResultsContainer.classList.add('hidden');
        return;
    }

    const itemDetails = e.target.closest('.item-details');
    const addButton = e.target.closest('.add-item-btn:not(:disabled)');

    if (addButton) {
        e.stopPropagation(); 
        const item = JSON.parse(addButton.dataset.item);
        addItemToRequest(item);
    } else if (itemDetails) {
        const itemContainer = itemDetails.closest('.search-result-item');
        const button = itemContainer.querySelector('.add-item-btn');
        if (button.disabled) return; 

        const item = JSON.parse(button.dataset.item);
        addItemToRequest(item);
        searchInput.value = '';
        searchResultsContainer.classList.add('hidden');
    }
});

function addItemToRequest(item) {
    if (requestItems.some(i => i.item_description === item.item_description && i.item_brand === item.item_brand)) {
        return;
    }
    requestItems.push({ ...item, quantity: 1 });
    renderRequestList();
    renderSearchResults(currentSearchResults); 
}

function renderRequestList() {
    const hasItems = requestItems.length > 0;
    requestTable.classList.toggle('hidden', !hasItems);
    emptyListMessage.classList.toggle('hidden', hasItems);
    submitRequestBtn.disabled = !hasItems;

    requestList.innerHTML = requestItems.map((item, index) => `
        <tr class="hover:bg-slate-50">
            <td class="p-4 text-sm font-medium">${item.item_description}</td>
            <td class="p-4 text-sm text-slate-600">${item.item_brand || 'N/A'}</td>
            <td class="p-4 text-sm text-slate-600">${item.supplier || 'N/A'}</td>
            <td class="p-4 text-sm text-slate-600 text-right font-mono">${formatPrice(item.unit_cost)}</td>
            <td class="p-4 text-center"><input type="number" min="1" value="${item.quantity}" class="w-20 text-center border border-slate-300 rounded-full p-2 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500" onchange="updateQuantity(${index}, this.value)"></td>
            <td class="p-4 text-center">
                <button class="text-slate-500 hover:text-red-600 p-2 rounded-full transition-colors" onclick="removeItem(${index})" title="Remove Item">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </td>
        </tr>
    `).join('');
}

window.updateQuantity = (index, newQuantity) => {
    const quantity = parseInt(newQuantity, 10);
    requestItems[index].quantity = quantity > 0 ? quantity : 1;
    if (quantity <= 0) renderRequestList();
};

window.removeItem = (index) => {
    requestItems.splice(index, 1);
    renderRequestList();
    if (!searchResultsContainer.classList.contains('hidden')) {
        renderSearchResults(currentSearchResults);
    }
};

// --- Submit / Update Functionality ---
submitRequestBtn.addEventListener('click', () => {
    if (requestItems.length === 0) return;

    const payload = requestItems.map(item => ({
        item_description: item.item_description,
        item_brand: item.item_brand,
        supplier: item.supplier,
        unit_cost: item.unit_cost,
        quantity: item.quantity
    }));

    const url = isEditing ? `/requests/${editingControlNumber}` : '/requests';
    const method = isEditing ? 'PUT' : 'POST';

    fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(response => response.ok ? response.json() : Promise.reject('Network response was not ok'))
    .then(data => {
        showModal('Success!', `Request ${isEditing ? 'updated' : 'submitted'} successfully! <br>Control Number: <strong>${data.control_number}</strong>`);
        resetForm();
        loadRequestHistory();
        // Reload dashboard charts if they exist
        if(window.loadTopItemsChart) window.loadTopItemsChart();
        if(window.loadRequestFrequencyChart) window.loadRequestFrequencyChart();
    })
    .catch(error => {
        console.error('Error submitting request:', error);
        showModal('Error', 'Failed to submit request. Please try again.');
    });
});

// --- Edit Mode ---
window.editRequest = (controlNumber) => {
    const requestToEdit = requestHistory.find(req => req.control_number === controlNumber);
    if (requestToEdit) {
        isEditing = true;
        editingControlNumber = controlNumber;
        requestItems = requestToEdit.items.map(item => ({...item}));
        
        formTitle.textContent = `Editing Request: ${controlNumber}`;
        submitBtnText.textContent = 'Save Changes';
        cancelEditBtn.classList.remove('hidden');
        
        renderRequestList();
        document.getElementById('requestFormSection').scrollIntoView({ behavior: 'smooth' });
    }
};

cancelEditBtn.addEventListener('click', resetForm);

function resetForm() {
    isEditing = false;
    editingControlNumber = null;
    requestItems = [];
    formTitle.textContent = 'Create New Request';
    submitBtnText.textContent = 'Submit Request';
    cancelEditBtn.classList.add('hidden');
    renderRequestList();
    if (!searchResultsContainer.classList.contains('hidden')) {
        renderSearchResults(currentSearchResults);
    }
}

// --- Delete Functionality ---
window.deleteRequest = async (controlNumber) => {
    const confirmed = await showCustomConfirm('Delete Request', `Are you sure you want to delete request <strong>${controlNumber}</strong>? This action cannot be undone.`);
    
    if (!confirmed) return;

    fetch(`/requests/${controlNumber}`, { method: 'DELETE' })
    .then(response => response.ok ? response.json() : response.json().then(err => Promise.reject(err)))
    .then(() => {
        showModal('Success', `Request ${controlNumber} has been deleted.`);
        loadRequestHistory();
    })
    .catch(error => {
        console.error('Error deleting request:', error);
        showModal('Error', `Failed to delete request. Server says: ${error.detail || 'Unknown error'}`);
    });
};

// --- History Display & Filtering ---
historySearchInput.addEventListener('input', filterAndRenderHistory);
showDeletedCheckbox.addEventListener('change', filterAndRenderHistory);

function filterAndRenderHistory() {
    const searchTerm = historySearchInput.value.toLowerCase();
    const showDeleted = showDeletedCheckbox.checked;

    const filteredHistory = requestHistory.filter(req => {
        const matchesSearch = searchTerm ? 
            req.control_number.toLowerCase().includes(searchTerm) || 
            req.items.some(item => item.item_description.toLowerCase().includes(searchTerm))
            : true;

        const matchesStatus = showDeleted ? true : req.status !== 'deleted';

        return matchesSearch && matchesStatus;
    });

    renderRequestHistory(filteredHistory);
}

function loadRequestHistory() {
    fetch('/requests')
        .then(response => response.json())
        .then(data => {
            requestHistory = data || []; 
            filterAndRenderHistory();
        })
        .catch(error => console.error('Error loading history:', error));
}

function renderRequestHistory(historyToRender) {
    if (!historyToRender || historyToRender.length === 0) {
        historyContainer.innerHTML = '<p class="text-slate-500 text-center py-10">No requests match the current filters.</p>';
        return;
    }
    historyContainer.innerHTML = historyToRender.map(req => {
        const isDeleted = req.status === 'deleted';
        const deletedClasses = isDeleted ? 'bg-red-50 border-red-200 opacity-70' : 'bg-white border-slate-200';
        return `
        <div class="border rounded-2xl mb-4 overflow-hidden transition-all ${deletedClasses}" id="history-${req.control_number}">
            <div class="p-4 flex justify-between items-center">
                <div>
                    <div class="flex items-center space-x-3">
                        <p class="font-semibold text-sm ${isDeleted ? 'text-slate-500 line-through' : 'text-slate-800'}">${req.control_number}</p>
                        ${isDeleted ? `<span class="text-xs font-bold uppercase tracking-wider text-red-700 bg-red-100 px-2 py-0.5 rounded-full">Deleted</span>` : ''}
                    </div>
                    <p class="text-xs ${isDeleted ? 'text-slate-500' : 'text-slate-600'} mt-1">
                        ${formatDate(req.request_date)}
                        ${req.last_edited ? `<span class="italic text-indigo-600"> (edited)</span>` : ''}
                    </p>
                </div>
                <div class="flex items-center space-x-1">
                    <button class="icon-btn text-slate-500 hover:text-indigo-600 hover:bg-indigo-100 disabled:text-slate-300 disabled:hover:bg-transparent disabled:cursor-not-allowed" onclick="editRequest('${req.control_number}')" title="Edit" ${isDeleted ? 'disabled' : ''}><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                    <button class="icon-btn text-slate-500 hover:text-red-600 hover:bg-red-100 disabled:text-slate-300 disabled:hover:bg-transparent disabled:cursor-not-allowed" onclick="deleteRequest('${req.control_number}')" title="Delete" ${isDeleted ? 'disabled' : ''}><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                    <button class="icon-btn text-slate-500 hover:text-gray-700 hover:bg-gray-200" onclick="printRequest('${req.control_number}')" title="Print"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg></button>
                    <button class="history-item-toggle icon-btn text-slate-500 hover:bg-slate-200" onclick="toggleHistoryItems(this)" title="View Items"><svg class="w-5 h-5 text-slate-500 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></button>
                </div>
            </div>
            <div class="p-4 border-t ${isDeleted ? 'border-red-200' : 'border-slate-200'} hidden bg-slate-50 text-xs">
                <table class="w-full">
                    <thead><tr class="font-semibold"><td class="pb-2">Item</td><td class="pb-2 text-center">Qty</td><td class="pb-2 text-right">Cost</td></tr></thead>
                    <tbody>
                        ${req.items.map(item => `
                            <tr>
                                <td class="py-1.5">${item.item_description} <em class="text-slate-500">(${item.item_brand})</em></td>
                                <td class="py-1.5 text-center">${item.quantity}</td>
                                <td class="py-1.5 text-right font-mono">${formatPrice(item.unit_cost)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        `;
    }).join('');
}

window.toggleHistoryItems = (element) => {
    const content = element.closest('.border').querySelector('.p-4.border-t');
    const icon = element.querySelector('svg');
    content.classList.toggle('hidden');
    icon.classList.toggle('rotate-180');
};

// --- Print Functionality ---
window.printRequest = async (controlNumber) => {
    const requestToPrint = requestHistory.find(req => req.control_number === controlNumber);
    if (!requestToPrint) {
        showModal('Error', 'Could not find the request to print.');
        return;
    }

    let pghLogoUrl = '';
    try {
        const response = await fetch('http://127.0.0.1:8000/static/UP_PGH_logo.png');
        if (!response.ok) throw new Error('Logo fetch failed');
        const blob = await response.blob();
        pghLogoUrl = URL.createObjectURL(blob);
    } catch (error) {
        console.error('Error fetching logo for printing:', error);
    }

    const itemsHtml = requestToPrint.items.map(item => {
        let descriptionHtml = item.item_description || '';
        if (item.item_brand && item.item_brand !== 'N/A') {
            descriptionHtml += `<br><span style="font-style: italic;">${item.item_brand}</span>`;
        }
        if (item.supplier && item.supplier !== 'N/A') {
            descriptionHtml += `<br><span style="font-style: italic;">${item.supplier}</span>`;
        }
        return `
            <tr class="item-row">
                <td></td>
                <td></td>
                <td>${descriptionHtml}</td>
                <td class="text-center">${item.quantity}</td>
                <td></td>
                <td class="text-right">${formatPrice(item.unit_cost)}</td>
                <td></td>
                <td></td>
            </tr>
        `;
    }).join('');

    const ROWS_PER_PAGE = 25; // A more reasonable number of rows per page
    const numItems = requestToPrint.items.length;
    let fillerRows = 0;

    if (numItems === 0) {
        fillerRows = ROWS_PER_PAGE;
    } else {
        const itemsOnLastPage = numItems % ROWS_PER_PAGE;
        if (itemsOnLastPage > 0) {
            fillerRows = ROWS_PER_PAGE - itemsOnLastPage;
        }
    }
    
    let emptyRowsHtml = '';
    for (let i = 0; i < fillerRows; i++) {
        emptyRowsHtml += `<tr class="filler-row">
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
        </tr>`;
    }

    const bodyContent = itemsHtml + emptyRowsHtml;

    const printContent = `
        <html>
        <head>
            <title>RIS: ${requestToPrint.control_number}</title>
            <style>
                @page { size: A4; margin: 1.5cm; }
                body { font-family: Arial, sans-serif; margin: 0; }
                .print-table { width: 100%; border-collapse: collapse; font-size: 9px; }
                .print-table thead, .print-table tfoot { display: table-header-group; }
                .print-table tfoot { display: table-footer-group; }
                .print-table th, .print-table td { border: 1px solid #888; padding: 4px 6px; text-align: left; vertical-align: top; }
                .print-table .filler-row td { border: 1px solid #888; border-top: none; padding: 4px 6px; } /* Match item row padding */
                .print-table th { font-weight: bold; }
                .print-table .item-row { page-break-inside: avoid; }
                .no-border, .no-border td { border: none !important; padding: 1px 2px; }
                .header-main-title { font-size: 14px; font-weight: bold; }
                .header-sub-title { font-size: 11px; }
                .text-right { text-align: right; }
                .text-center { text-align: center; }
            </style>
        </head>
        <body>
            <table class="print-table">
                <thead>
                    <tr>
                        <td colspan="8" style="border: none !important; padding: 0 0 10px 0;">
                            <table class="no-border" style="width: 100%;">
                                <tr>
                                    <td style="width: 20%; text-align: left;"><img src="${pghLogoUrl}" style="width: 70px; height: auto;"></td>
                                    <td style="text-align: center;">
                                        <div class="header-main-title">PHILIPPINE GENERAL HOSPITAL</div>
                                        <div class="header-sub-title">The National University Hospital</div>
                                        <div class="header-sub-title">University of the Philippines Manila</div>
                                        <div class="header-sub-title">Taft Avenue, Manila</div>
                                        <div class="header-sub-title" style="font-weight: bold; font-size: 10px;">PHIC Accredited Health Care Provider</div>
                                        <div class="header-sub-title" style="font-weight: bold; font-size: 10px;">ISO 9001 Certified</div>
                                    </td>
                                    <td style="width: 20%; text-align: right; font-size: 9px; vertical-align: top;">PGH FORM NO. Q-310050<br>REV. 00; Eff. 26 September 2019</td>
                                </tr>
                            </table>
                            <h2 style="text-align: center; font-size: 14px; margin: 10px 0; font-weight: bold;">DRUGS/MEDICINES AND MEDICAL SUPPLIES REQUISITION AND ISSUE FORM</h2>
                            <table class="no-border" style="width: 100%; font-size: 11px;">
                               <tr><td style="width: 60%;"><strong>Division:</strong> CATHLAB</td><td style="width: 40%;"><strong>RIS No.:</strong> ${requestToPrint.control_number}</td></tr>
                               <tr><td><strong>Office:</strong> CATHLAB</td><td><strong>SAI No.:</strong></td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <th class="text-center" style="width: 10%;">Quantity on Hand</th><th class="text-center" style="width: 10%;">Medicine Code</th>
                        <th style="width: 40%;">Item/Description</th><th class="text-center">Quantity Requested</th><th class="text-center">Quantity Issued</th>
                        <th class="text-right">Unit Cost</th><th class="text-right">Selling Price</th><th class="text-right">Sub-Total</th>
                    </tr>
                </thead>
                <tfoot>
                    <tr>
                        <td colspan="8" style="border: none !important; padding-top: 10px;">
                            <div style="font-size: 11px; padding-bottom: 10px;"><strong>Purpose:</strong> _____________________________________________________________________________________________________</div>
                             <table class="no-border" style="width: 100%; font-size: 10px;">
                                <tr style="text-align: left;">
                                    <td style="width: 25%;"><strong>Requested by:</strong></td><td style="width: 25%; padding-left: 30px;"><strong>Approved by:</strong></td>
                                    <td style="width: 25%; padding-left: 30px;"><strong>Issued by:</strong></td><td style="width: 25%; padding-left: 30px;"><strong>Received by:</strong></td>
                                </tr>
                                <tr style="vertical-align: bottom; text-align: center;">
                                    <td style="padding-top: 40px;"><div style="border-bottom: 1px solid black; padding-bottom: 2px;"><strong>LEGASPI, VENUS JOY JOSE</strong></div></td>
                                    <td style="padding-top: 40px; padding-left: 30px;"><div style="border-bottom: 1px solid black; padding-bottom: 2px;"><strong>ERIC OLIVER SISON, MD</strong></div></td>
                                    <td style="padding-top: 40px; padding-left: 30px;"><div style="border-bottom: 1px solid black; padding-bottom: 2px;">&nbsp;</div></td>
                                    <td style="padding-top: 40px; padding-left: 30px;"><div style="border-bottom: 1px solid black; padding-bottom: 2px;">&nbsp;</div></td>
                                </tr>
                                <tr style="text-align: center;">
                                    <td style="padding-top: 2px;">Signature Over Printed Name</td><td style="padding-top: 2px; padding-left: 30px;">Signature Over Printed Name</td>
                                    <td style="padding-top: 2px; padding-left: 30px;">Signature Over Printed Name</td><td style="padding-top: 2px; padding-left: 30px;">Signature Over Printed Name</td>
                                </tr>
                                 <tr style="text-align: center;">
                                    <td style="padding-top: 25px;"><div style="border-bottom: 1px solid black; padding-bottom: 2px;">&nbsp;</div></td>
                                    <td style="padding-top: 25px; padding-left: 30px;"><div style="border-bottom: 1px solid black; padding-bottom: 2px;">&nbsp;</div></td>
                                    <td style="padding-top: 25px; padding-left: 30px;"><div style="border-bottom: 1px solid black; padding-bottom: 2px;">&nbsp;</div></td>
                                    <td style="padding-top: 25px; padding-left: 30px;"><div style="border-bottom: 1px solid black; padding-bottom: 2px;">&nbsp;</div></td>
                                </tr>
                                <tr style="text-align: center;">
                                    <td style="padding-top: 2px;">Designation</td><td style="padding-top: 2px; padding-left: 30px;">Designation</td>
                                    <td style="padding-top: 2px; padding-left: 30px;">Designation</td><td style="padding-top: 2px; padding-left: 30px;">Designation</td>
                                </tr>
                                 <tr style="text-align: left;">
                                    <td style="padding-top: 20px;"><strong>Date:</strong> <span style="border-bottom: 1px solid black; padding-right: 20px;">${new Date(requestToPrint.request_date).toLocaleDateString('en-US', {month: 'numeric', day: 'numeric', year: 'numeric'})}</span></td>
                                    <td style="padding-top: 20px; padding-left: 30px;"><strong>Date:</strong> <span style="border-bottom: 1px solid black; padding-right: 50px;">&nbsp;</span></td>
                                    <td style="padding-top: 20px; padding-left: 30px;"><strong>Date:</strong> <span style="border-bottom: 1px solid black; padding-right: 50px;">&nbsp;</span></td>
                                    <td style="padding-top: 20px; padding-left: 30px;"><strong>Date:</strong> <span style="border-bottom: 1px solid black; padding-right: 50px;">&nbsp;</span></td>
                                </tr>
                             </table>
                        </td>
                    </tr>
                </tfoot>
                <tbody>
                   ${bodyContent}
                </tbody>
            </table>
        </body>
        </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(printContent);
    doc.close();
    
    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        if (pghLogoUrl) {
            URL.revokeObjectURL(pghLogoUrl);
        }
        document.body.removeChild(iframe);
    }, 500); 
};

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    renderRequestList();
    loadRequestHistory();
});
