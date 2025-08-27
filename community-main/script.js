// Global state
let notices = JSON.parse(localStorage.getItem('notices') || '[]');
let favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
let currentNotice = null;
let editingId = null;
let loggedInUser = localStorage.getItem('loggedInUser'); // Mock user ID
const NOTICES_PER_PAGE = 6;
let currentPage = 1;

// --- Utility functions ---

function generateId() {
    return 'notice_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) { // Same day, format as time
        return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
        return 'Yesterday';
    } else if (diffDays < 7) {
        return `${diffDays} days ago`;
    } else {
        return date.toLocaleDateString();
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function stripHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
}

function showToast(message, type = 'info', duration = 5000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span>${escapeHtml(message)}</span>
        <button onclick="this.parentElement.remove()" style="background: none; border: none; margin-left: auto; cursor: pointer; font-size: 16px; color: inherit;">&times;</button>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, duration);
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// --- Theme management ---

function toggleTheme() {
    const body = document.body;
    const currentTheme = body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);

    const themeBtn = document.getElementById('theme-toggle');
    themeBtn.innerHTML = newTheme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
}

// --- View management ---

function showView(viewName) {
    // Update navigation
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const targetBtn = document.querySelector(`[data-view="${viewName}"]`);
    if (targetBtn) {
        targetBtn.classList.add('active');
    } else if (viewName === 'my-notices' && document.getElementById('my-notices-nav')) {
         document.getElementById('my-notices-nav').classList.add('active');
    }

    // Update views
    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    document.getElementById(`${viewName}-view`).classList.add('active');

    // Load view-specific data
    if (viewName === 'favorites') {
        loadFavorites();
    } else if (viewName === 'create') {
        resetForm();
    } else if (viewName === 'home') {
        currentPage = 1; // Reset pagination
        displayNotices();
        updateStatistics();
    } else if (viewName === 'my-notices') {
        loadMyNotices();
    }
    closeModal(); // Close any open modals when changing view
}

// --- Notice management ---

function getFilteredNotices(isMyNotices = false) {
    let filtered = [...notices];

    // Filter by user if 'My Notices' view
    if (isMyNotices && loggedInUser) {
        filtered = filtered.filter(notice => notice.userId === loggedInUser);
    } else if (isMyNotices && !loggedInUser) {
        return []; // No notices if not logged in for 'My Notices'
    }

    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const categoryFilter = document.getElementById('category-filter').value;
    const priorityFilter = document.getElementById('priority-filter').value;
    const sortFilter = document.getElementById('sort-filter').value;

    // Apply search filter
    if (searchTerm) {
        filtered = filtered.filter(notice => 
            notice.title.toLowerCase().includes(searchTerm) ||
            stripHtml(notice.content).toLowerCase().includes(searchTerm) || // Strip HTML for search
            (notice.location && notice.location.toLowerCase().includes(searchTerm)) ||
            (notice.contactName && notice.contactName.toLowerCase().includes(searchTerm))
        );
    }

    // Apply category filter
    if (categoryFilter) {
        filtered = filtered.filter(notice => notice.category === categoryFilter);
    }

    // Apply priority filter
    if (priorityFilter) {
        filtered = filtered.filter(notice => notice.priority === priorityFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
        switch (sortFilter) {
            case 'date-asc':
                return new Date(a.createdAt) - new Date(b.createdAt);
            case 'priority':
                const priorityOrder = { urgent: 3, normal: 2, low: 1 };
                return priorityOrder[b.priority] - priorityOrder[a.priority];
            case 'views':
                return (b.views || 0) - (a.views || 0);
            default: // date-desc
                return new Date(b.createdAt) - new Date(a.createdAt);
        }
    });

    return filtered;
}

function displayNotices(append = false) {
    const allFilteredNotices = getFilteredNotices();
    const grid = document.getElementById('notices-grid');
    const emptyState = document.getElementById('empty-state');
    const loadMoreBtn = document.getElementById('load-more-btn');

    const startIndex = 0;
    const endIndex = currentPage * NOTICES_PER_PAGE;
    const noticesToShow = allFilteredNotices.slice(startIndex, endIndex);
    
    if (noticesToShow.length === 0 && !append) {
        grid.innerHTML = '';
        emptyState.style.display = 'block';
        loadMoreBtn.style.display = 'none';
        return;
    }
    
    emptyState.style.display = 'none';
    if (append) {
        grid.innerHTML += noticesToShow.slice((currentPage - 1) * NOTICES_PER_PAGE).map(notice => createNoticeCard(notice)).join('');
    } else {
        grid.innerHTML = noticesToShow.map(notice => createNoticeCard(notice)).join('');
    }
    
    if (endIndex < allFilteredNotices.length) {
        loadMoreBtn.style.display = 'block';
    } else {
        loadMoreBtn.style.display = 'none';
    }

    attachNoticeEventListeners(grid);
}

function loadMoreNotices() {
    currentPage++;
    displayNotices(true);
}

function loadMyNotices() {
    const myFilteredNotices = getFilteredNotices(true);
    const grid = document.getElementById('my-notices-grid');
    const emptyState = document.getElementById('empty-my-notices');
    
    if (!loggedInUser) {
        grid.innerHTML = '';
        emptyState.innerHTML = `
            <div class="empty-icon"><i class="fas fa-lock"></i></div>
            <h3>Log in to see your notices!</h3>
            <p>You need to be logged in to view notices you've created.</p>
            <button class="btn" id="login-from-my-notices"><i class="fas fa-sign-in-alt"></i> Log In</button>
        `;
        emptyState.style.display = 'block';
        document.getElementById('login-from-my-notices').onclick = () => showLoginModal();
        return;
    }

    if (myFilteredNotices.length === 0) {
        grid.innerHTML = '';
        emptyState.style.display = 'block';
        emptyState.innerHTML = `
            <div class="empty-icon"><i class="fas fa-file-alt"></i></div>
            <h3>You haven't created any notices yet.</h3>
            <p>Start sharing with your community!</p>
            <button class="btn" data-view="create"><i class="fas fa-plus-circle"></i> Create New Notice</button>
        `;
        return;
    }
    
    emptyState.style.display = 'none';
    grid.innerHTML = myFilteredNotices.map(notice => createNoticeCard(notice)).join('');
    
    attachNoticeEventListeners(grid);
}

function attachNoticeEventListeners(gridElement) {
    gridElement.querySelectorAll('.notice-card').forEach(card => {
        card.onclick = null; // Remove old listeners to prevent duplicates
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.action-btn')) {
                showNoticeDetails(card.dataset.id);
            }
        });
    });
}

function createNoticeCard(notice) {
    const isExpired = notice.expiryDate && new Date(notice.expiryDate) < new Date();
    const isFavorite = favorites.includes(notice.id);
    const isMyNotice = loggedInUser && notice.userId === loggedInUser;
    
    const categoryIcons = {
        announcement: '📢', event: '🎉', classified: '🏷️',
        job: '💼', 'lost-found': '🔍', community: '🏘️'
    };

    const priorityColors = { urgent: 'var(--error)', normal: 'var(--primary)', low: 'var(--secondary)' };
    
    return `
        <div class="notice-card ${notice.priority}" data-id="${notice.id}" ${isExpired ? 'style="opacity: 0.6;"' : ''}>
            ${notice.imageUrl ? `<img src="${escapeHtml(notice.imageUrl)}" alt="${escapeHtml(notice.title)} image">` : ''}
            <div class="notice-header">
                <div>
                    <h3 class="notice-title">${escapeHtml(notice.title)}</h3>
                    ${isExpired ? '<span style="color: var(--error); font-size: 12px; font-weight: 500;">⏰ EXPIRED</span>' : ''}
                </div>
                <span class="notice-category">${categoryIcons[notice.category] || '📋'} ${notice.category.charAt(0).toUpperCase() + notice.category.slice(1).replace('-', ' & ')}</span>
            </div>
            
            <div class="notice-meta">
                <span><i class="far fa-calendar-alt"></i> ${formatDate(notice.createdAt)}</span>
                ${notice.location ? `<span><i class="fas fa-map-marker-alt"></i> ${escapeHtml(notice.location)}</span>` : ''}
                <span><i class="fas fa-eye"></i> ${notice.views || 0}</span>
                ${notice.priority === 'urgent' ? '<span style="color: var(--error);"><i class="fas fa-exclamation-triangle"></i> Urgent</span>' : ''}
            </div>
            
            <div class="notice-content">${notice.content}</div>
            
            <div class="notice-actions">
                <div class="notice-stats">
                    <span><i class="far fa-comment"></i> ${notice.comments ? notice.comments.length : 0}</span>
                </div>
                
                <div class="notice-buttons">
                    <button class="action-btn favorite ${isFavorite ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavorite('${notice.id}')" title="Add to favorites">
                        <i class="${isFavorite ? 'fas' : 'far'} fa-heart"></i>
                    </button>
                    <button class="action-btn" onclick="event.stopPropagation(); shareNotice('${notice.id}')" title="Share">
                        <i class="fas fa-share-alt"></i>
                    </button>
                    ${isMyNotice ? `
                        <button class="action-btn" onclick="event.stopPropagation(); editNotice('${notice.id}')" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="action-btn" onclick="event.stopPropagation(); deleteNotice('${notice.id}')" title="Delete">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

function showNoticeDetails(noticeId) {
    const notice = notices.find(n => n.id === noticeId);
    if (!notice) {
        showToast('Notice not found', 'error');
        return;
    }

    // Increment view count
    if (notice.id !== currentNotice?.id) { // Only increment if opening a new notice
        notice.views = (notice.views || 0) + 1;
        saveNotices();
    }
    
    currentNotice = notice;
    displayNoticeModal(notice);
    // Re-display notices to update view count on home/my notices/favorites
    const currentView = document.querySelector('.view.active').id.replace('-view', '');
    if (currentView === 'home') displayNotices();
    else if (currentView === 'my-notices') loadMyNotices();
    else if (currentView === 'favorites') loadFavorites();
}

function displayNoticeModal(notice) {
    const modal = document.getElementById('notice-modal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    
    title.textContent = notice.title;
    
    const isFavorite = favorites.includes(notice.id);
    document.getElementById('favorite-icon').className = `far fa-heart ${isFavorite ? 'fas' : 'far'}`;
    document.getElementById('favorite-text').textContent = isFavorite ? 'Remove from Favorites' : 'Add to Favorites';
    
    const categoryIcons = { announcement: '📢', event: '🎉', classified: '🏷️', job: '💼', 'lost-found': '🔍', community: '🏘️' };
    const priorityEmojis = { urgent: '⚠️', normal: '📋', low: '📝' };
    
    // Render rich text content
    const renderedContent = notice.content; 

    body.innerHTML = `
        ${notice.imageUrl ? `<img src="${escapeHtml(notice.imageUrl)}" alt="${escapeHtml(notice.title)} image">` : ''}
        <div class="notice-meta" style="margin-bottom: 20px; display: flex; gap: 16px; flex-wrap: wrap;">
            <span><i class="far fa-calendar-alt"></i> ${formatDate(notice.createdAt)}</span>
            <span style="background: var(--primary); color: white; padding: 4px 8px; border-radius: 12px; font-size: 12px;">
                ${categoryIcons[notice.category]} ${notice.category.charAt(0).toUpperCase() + notice.category.slice(1).replace('-', ' & ')}
            </span>
            <span style="color: var(--${notice.priority === 'urgent' ? 'error' : notice.priority === 'low' ? 'secondary' : 'primary'});">
                ${priorityEmojis[notice.priority]} ${notice.priority.charAt(0).toUpperCase() + notice.priority.slice(1)}
            </span>
        </div>
        
        <div style="margin-bottom: 24px; line-height: 1.6;">
            ${renderedContent}
        </div>
        
        ${notice.location || notice.contactName || notice.contactEmail || notice.contactPhone ? `
            <div style="background: var(--surface); padding: 20px; border-radius: var(--radius); margin-bottom: 20px;">
                <h4 style="margin-bottom: 12px; color: var(--text); display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-phone-alt"></i> Contact Information
                </h4>
                ${notice.contactName ? `<p style="margin-bottom: 8px;"><strong>👤 Name:</strong> ${escapeHtml(notice.contactName)}</p>` : ''}
                ${notice.contactEmail ? `<p style="margin-bottom: 8px;"><strong>📧 Email:</strong> <a href="mailto:${escapeHtml(notice.contactEmail)}" style="color: var(--primary);">${escapeHtml(notice.contactEmail)}</a></p>` : ''}
                ${notice.contactPhone ? `<p style="margin-bottom: 8px;"><strong>📱 Phone:</strong> <a href="tel:${escapeHtml(notice.contactPhone)}" style="color: var(--primary);">${escapeHtml(notice.contactPhone)}</a></p>` : ''}
                ${notice.location ? `<p style="margin-bottom: 8px;"><strong>📍 Location:</strong> ${escapeHtml(notice.location)}</p>` : ''}
            </div>
        ` : ''}
        
        <div style="font-size: 14px; color: var(--text-muted); display: flex; gap: 16px; flex-wrap: wrap;">
            <span><i class="fas fa-eye"></i> Views: ${notice.views || 0}</span>
            ${notice.expiryDate ? `<span><i class="fas fa-hourglass-end"></i> Expires: ${new Date(notice.expiryDate).toLocaleDateString()}</span>` : ''}
            <span><i class="fas fa-history"></i> Created: ${new Date(notice.createdAt).toLocaleDateString()}</span>
        </div>

        <div class="comments-section">
            <h4><i class="fas fa-comments"></i> Comments (${notice.comments ? notice.comments.length : 0})</h4>
            <div class="comment-list" id="comment-list">
                ${notice.comments && notice.comments.length > 0 ? 
                    notice.comments.map(comment => `
                        <div class="comment-item">
                            <div class="comment-meta">
                                <span><strong>${escapeHtml(comment.author || 'Anonymous')}</strong></span>
                                <span>${formatDate(comment.createdAt)}</span>
                            </div>
                            <div class="comment-content">${escapeHtml(comment.text)}</div>
                        </div>
                    `).join('')
                    : '<p style="color: var(--text-muted);">No comments yet. Be the first to leave one!</p>'
                }
            </div>
            <form class="add-comment-form" id="add-comment-form">
                <input type="text" id="comment-input" placeholder="Add a comment..." required>
                <button type="submit" class="btn btn-sm"><i class="fas fa-paper-plane"></i> Add</button>
            </form>
        </div>
    `;
    
    modal.classList.add('active');

    // Attach comment form listener
    document.getElementById('add-comment-form').addEventListener('submit', handleAddComment);

    // Hide/show edit/delete buttons based on user
    const editBtn = document.getElementById('edit-btn');
    const deleteBtn = document.getElementById('delete-btn');
    if (loggedInUser && notice.userId === loggedInUser) {
        editBtn.style.display = 'inline-flex';
        deleteBtn.style.display = 'inline-flex';
    } else {
        editBtn.style.display = 'none';
        deleteBtn.style.display = 'none';
    }
}

function toggleFavorite(noticeId) {
    const index = favorites.indexOf(noticeId);
    if (index > -1) {
        favorites.splice(index, 1);
        showToast('Removed from favorites', 'info');
    } else {
        favorites.push(noticeId);
        showToast('Added to favorites', 'success');
    }
    saveFavorites();
    displayNotices();
    loadFavorites(); // Update favorites view if active
    
    // Update modal if open
    if (currentNotice && currentNotice.id === noticeId) {
        displayNoticeModal(currentNotice);
    }
}

function shareNotice(noticeId) {
    // This function now just opens the dropdown, actual sharing is handled by specific buttons
    // For now, just copy to clipboard as a fallback/primary
    const notice = notices.find(n => n.id === noticeId);
    if (!notice) return;
    
    const shareText = `${notice.title}\n\n${stripHtml(notice.content)}${notice.location ? `\n\nLocation: ${notice.location}` : ''}\n\nCheck it out on the Community Notice Board!`;
    
    if (navigator.share) {
        navigator.share({
            title: notice.title,
            text: shareText
        });
    } else {
        // Fallback for non-Web Share API browsers
        const tempInput = document.createElement('textarea');
        tempInput.value = shareText;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
        showToast('Notice copied to clipboard!', 'success');
    }
}

function editNotice(noticeId) {
    if (!loggedInUser) {
        showToast("You must be logged in to edit notices.", "error");
        showLoginModal();
        return;
    }

    const notice = notices.find(n => n.id === noticeId);
    if (!notice) return;

    if (notice.userId !== loggedInUser) {
        showToast("You can only edit your own notices.", "error");
        return;
    }
    
    editingId = noticeId;
    currentNotice = notice;
    
    // Fill form with notice data
    document.getElementById('title').value = notice.title;
    document.getElementById('category').value = notice.category;
    document.getElementById('priority').value = notice.priority;
    // Set content for rich text editor
    document.getElementById('content').innerHTML = notice.content;
    document.getElementById('contact-name').value = notice.contactName || '';
    document.getElementById('contact-email').value = notice.contactEmail || '';
    document.getElementById('contact-phone').value = notice.contactPhone || '';
    document.getElementById('location').value = notice.location || '';
    document.getElementById('expiry-date').value = notice.expiryDate || '';

    // Handle image preview for editing
    const imagePreviewContainer = document.getElementById('image-preview-container');
    imagePreviewContainer.innerHTML = '';
    if (notice.imageUrl) {
        const imgDiv = document.createElement('div');
        imgDiv.className = 'image-preview';
        imgDiv.innerHTML = `
            <img src="${escapeHtml(notice.imageUrl)}" alt="Preview">
            <button type="button" class="remove-image" data-image-url="${escapeHtml(notice.imageUrl)}">&times;</button>
        `;
        imagePreviewContainer.appendChild(imgDiv);
        imgDiv.querySelector('.remove-image').onclick = (e) => removeImageFromForm(e, noticeId);
    }
    
    document.getElementById('title-count').textContent = notice.title.length;
    document.getElementById('form-title').textContent = 'Edit Notice';
    document.getElementById('submit-btn').innerHTML = '<i class="fas fa-save"></i> Update Notice';
    
    closeModal();
    showView('create');
}

function deleteNotice(noticeId) {
    if (!loggedInUser) {
        showToast("You must be logged in to delete notices.", "error");
        showLoginModal();
        return;
    }

    const noticeToDelete = notices.find(n => n.id === noticeId);
    if (noticeToDelete && noticeToDelete.userId !== loggedInUser) {
        showToast("You can only delete your own notices.", "error");
        return;
    }

    if (confirm('Are you sure you want to delete this notice?')) {
        notices = notices.filter(n => n.id !== noticeId);
        favorites = favorites.filter(id => id !== noticeId);
        saveNotices();
        saveFavorites();
        showToast('Notice deleted successfully', 'success');
        closeModal();
        displayNotices();
        loadFavorites();
        loadMyNotices();
        updateStatistics();
    }
}

function handleAddComment(e) {
    e.preventDefault();
    if (!loggedInUser) {
        showToast("You must be logged in to comment.", "error");
        showLoginModal();
        return;
    }

    const commentInput = document.getElementById('comment-input');
    const commentText = commentInput.value.trim();

    if (!commentText) {
        showToast("Comment cannot be empty.", "warning");
        return;
    }

    if (currentNotice) {
        if (!currentNotice.comments) {
            currentNotice.comments = [];
        }
        currentNotice.comments.push({
            author: loggedInUser, // Use mock username
            text: commentText,
            createdAt: new Date().toISOString()
        });
        saveNotices();
        displayNoticeModal(currentNotice); // Re-render modal to show new comment
        showToast("Comment added!", "success");
        commentInput.value = ''; // Clear input
    }
}

// --- Form handling ---

function handleFormSubmit(e) {
    e.preventDefault();
    
    const formData = getFormData();
    if (!validateForm(formData)) {
        return;
    }

    if (!loggedInUser) {
        showToast("You must be logged in to publish a notice.", "error");
        showLoginModal();
        return;
    }

    // Get image data
    const imageFile = document.getElementById('image-upload').files[0];
    let imageUrl = currentNotice?.imageUrl || null; // Retain existing image if not uploading new

    const saveNoticeData = (imgUrl) => {
        const notice = {
            ...formData,
            imageUrl: imgUrl,
            id: editingId || generateId(),
            createdAt: editingId ? currentNotice.createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            views: editingId ? (currentNotice ? currentNotice.views : 0) : 0,
            comments: editingId ? (currentNotice ? currentNotice.comments : []) : [],
            userId: loggedInUser // Assign current logged-in user to the notice
        };

        if (editingId) {
            const index = notices.findIndex(n => n.id === editingId);
            if (index !== -1) {
                notices[index] = notice;
                showToast('Notice updated successfully', 'success');
            }
        } else {
            notices.unshift(notice);
            showToast('Notice created successfully', 'success');
        }

        saveNotices();
        resetForm();
        showView('home');
        displayNotices();
        updateStatistics();
    };

    if (imageFile) {
        const reader = new FileReader();
        reader.onload = (e) => {
            saveNoticeData(e.target.result); // Save image as Data URL
        };
        reader.readAsDataURL(imageFile);
    } else {
        saveNoticeData(imageUrl); // Save without new image, or retain old one
    }
}

function getFormData() {
    return {
        title: document.getElementById('title').value.trim(),
        category: document.getElementById('category').value,
        priority: document.getElementById('priority').value,
        // Get content from rich text editor
        content: document.getElementById('content').innerHTML.trim(), 
        contactName: document.getElementById('contact-name').value.trim(),
        contactEmail: document.getElementById('contact-email').value.trim(),
        contactPhone: document.getElementById('contact-phone').value.trim(),
        location: document.getElementById('location').value.trim(),
        expiryDate: document.getElementById('expiry-date').value
    };
}

function validateForm(data) {
    let isValid = true;
    // Clear previous errors
    document.querySelectorAll('.error-message').forEach(el => el.textContent = '');
    document.querySelectorAll('.form-group input, .form-group select, .form-group textarea').forEach(el => el.classList.remove('invalid'));

    if (!data.title) {
        document.getElementById('title-error').textContent = 'Title is required.';
        document.getElementById('title').classList.add('invalid');
        isValid = false;
    }
    
    if (!data.category) {
        document.getElementById('category-error').textContent = 'Category is required.';
        document.getElementById('category').classList.add('invalid');
        isValid = false;
    }
    
    // Check if content is empty, considering rich text might have empty tags
    if (!stripHtml(data.content)) { 
        document.getElementById('content-error').textContent = 'Content is required.';
        document.getElementById('content').classList.add('invalid');
        isValid = false;
    }
    
    if (data.contactEmail && !isValidEmail(data.contactEmail)) {
        document.getElementById('contact-email-error').textContent = 'Please enter a valid email address.';
        document.getElementById('contact-email').classList.add('invalid');
        isValid = false;
    }
    
    if (data.expiryDate) {
        const expiryDate = new Date(data.expiryDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize today's date
        if (expiryDate <= today) {
            document.getElementById('expiry-date-error').textContent = 'Expiry date must be in the future.';
            document.getElementById('expiry-date').classList.add('invalid');
            isValid = false;
        }
    }
    
    if (!isValid) {
        showToast('Please correct the errors in the form.', 'error');
    }
    return isValid;
}

function resetForm() {
    const form = document.getElementById('notice-form');
    if (form) {
        form.reset();
    }
    
    document.getElementById('title').value = '';
    document.getElementById('category').value = '';
    document.getElementById('priority').value = 'normal';
    document.getElementById('content').innerHTML = ''; // Clear rich text editor
    document.getElementById('contact-name').value = '';
    document.getElementById('contact-email').value = '';
    document.getElementById('contact-phone').value = '';
    document.getElementById('location').value = '';
    document.getElementById('expiry-date').value = '';
    document.getElementById('image-upload').value = ''; // Clear file input
    document.getElementById('image-preview-container').innerHTML = ''; // Clear image preview

    document.getElementById('title-count').textContent = '0';
    document.getElementById('form-title').textContent = 'Create Notice';
    document.getElementById('submit-btn').innerHTML = '<i class="fas fa-paper-plane"></i> Publish Notice';
    editingId = null;
    currentNotice = null;

    // Clear all form validation messages and invalid classes
    document.querySelectorAll('.error-message').forEach(el => el.textContent = '');
    document.querySelectorAll('.form-group input, .form-group select, .form-group textarea, .editor-content').forEach(el => el.classList.remove('invalid'));
}

function handleImageUpload(event) {
    const file = event.target.files[0];
    const previewContainer = document.getElementById('image-preview-container');
    previewContainer.innerHTML = ''; // Clear previous preview

    if (file) {
        if (file.size > 2 * 1024 * 1024) { // 2MB limit
            showToast('Image file size must be less than 2MB.', 'error');
            event.target.value = ''; // Clear the input
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const imgDiv = document.createElement('div');
            imgDiv.className = 'image-preview';
            imgDiv.innerHTML = `
                <img src="${e.target.result}" alt="Image preview">
                <button type="button" class="remove-image">&times;</button>
            `;
            previewContainer.appendChild(imgDiv);

            imgDiv.querySelector('.remove-image').onclick = () => {
                previewContainer.innerHTML = '';
                document.getElementById('image-upload').value = ''; // Clear file input
                if (currentNotice) currentNotice.imageUrl = null; // Remove image from current notice if editing
            };
        };
        reader.readAsDataURL(file);
    }
}

function removeImageFromForm(event, noticeId = null) {
    event.stopPropagation(); // Prevent card click
    const previewContainer = document.getElementById('image-preview-container');
    previewContainer.innerHTML = '';
    document.getElementById('image-upload').value = '';

    // If editing, also remove image from the notice data
    if (noticeId) {
        const notice = notices.find(n => n.id === noticeId);
        if (notice) {
            notice.imageUrl = null;
            saveNotices();
        }
    }
    showToast('Image removed.', 'info');
}

// --- Favorites management ---

function loadFavorites() {
    const favoriteNotices = notices.filter(notice => favorites.includes(notice.id));
    const grid = document.getElementById('favorites-grid');
    const emptyState = document.getElementById('empty-favorites');
    
    if (favoriteNotices.length === 0) {
        grid.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    grid.innerHTML = favoriteNotices.map(notice => createNoticeCard(notice)).join('');
    
    attachNoticeEventListeners(grid);
}

// --- Statistics ---

function updateStatistics() {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const thisWeekNotices = notices.filter(n => new Date(n.createdAt) >= oneWeekAgo);
    const urgentNotices = notices.filter(n => n.priority === 'urgent');
    
    document.getElementById('total-notices').textContent = notices.length;
    document.getElementById('week-notices').textContent = thisWeekNotices.length;
    document.getElementById('urgent-notices').textContent = urgentNotices.length;
}

// --- Storage functions ---

function saveNotices() {
    localStorage.setItem('notices', JSON.stringify(notices));
}

function saveFavorites() {
    localStorage.setItem('favorites', JSON.stringify(favorites));
}

function saveLoggedInUser(username) {
    localStorage.setItem('loggedInUser', username);
    loggedInUser = username;
    updateAuthUI();
}

function removeLoggedInUser() {
    localStorage.removeItem('loggedInUser');
    loggedInUser = null;
    updateAuthUI();
}

// --- Modal functions ---

function closeModal() {
    document.getElementById('notice-modal').classList.remove('active');
    document.getElementById('login-modal').classList.remove('active');
    document.getElementById('share-btn').closest('.dropdown').classList.remove('active'); // Close share dropdown
}
function showLoginModal() {
    document.getElementById('login-modal').classList.add('active');
}

// --- Authentication (Mock) ---
function updateAuthUI() {
    const authBtn = document.getElementById('auth-btn');
    const userWelcome = document.getElementById('user-welcome');
    const myNoticesNav = document.getElementById('my-notices-nav');

    if (loggedInUser) {
        userWelcome.textContent = `Welcome, ${loggedInUser}!`;
        authBtn.textContent = 'Log Out';
        authBtn.onclick = handleLogout;
        myNoticesNav.style.display = 'inline-flex'; // Show My Notices link
    } else {
        userWelcome.textContent = '';
        authBtn.textContent = 'Log In';
        authBtn.onclick = showLoginModal;
        myNoticesNav.style.display = 'none'; // Hide My Notices link
    }
    // Refresh current view to reflect auth state (e.g., enable/disable edit/delete)
    const currentView = document.querySelector('.view.active').id.replace('-view', '');
    showView(currentView);
}

function handleLogin(e) {
    e.preventDefault();
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    // Simple mock authentication
    if (username === 'user' && password === 'password') { // Example credentials
        saveLoggedInUser(username);
        showToast(`Logged in as ${username}!`, 'success');
        closeModal();
    } else {
        showToast('Invalid username or password.', 'error');
    }
}

function handleLogout() {
    if (confirm('Are you sure you want to log out?')) {
        removeLoggedInUser();
        showToast('Logged out successfully.', 'info');
        showView('home'); // Redirect to home after logout
    }
}

// --- Rich Text Editor (Basic) ---
function setupRichTextEditor() {
    const contentEditor = document.getElementById('content');
    document.querySelectorAll('.editor-toolbar button').forEach(button => {
        button.addEventListener('click', () => {
            contentEditor.focus(); // Focus editor before command
            const command = button.dataset.command;
            if (command === 'createLink') {
                const url = prompt('Enter the URL:');
                if (url) {
                    document.execCommand(command, false, url);
                }
            } else {
                document.execCommand(command, false, null);
            }
        });
    });

    // Prevent placeholder from appearing when content is added programmatically
    // and remove placeholder when user types
    contentEditor.addEventListener('input', () => {
        if (contentEditor.innerHTML.trim() === '<br>') { // Edge case for only a break tag
            contentEditor.innerHTML = '';
        }
    });
    contentEditor.addEventListener('focus', () => {
        if (contentEditor.textContent.trim() === '' && contentEditor.innerHTML.includes('data-placeholder')) {
            contentEditor.innerHTML = '';
        }
    });
    contentEditor.addEventListener('blur', () => {
        if (contentEditor.textContent.trim() === '') {
            contentEditor.innerHTML = '<span data-placeholder="Enter notice content..." style="color: var(--text-muted);"></span>';
        }
    });
    // Initial placeholder setting
    if (contentEditor.textContent.trim() === '') {
        contentEditor.innerHTML = '<span data-placeholder="Enter notice content..." style="color: var(--text-muted);"></span>';
    }
}


// --- Event listeners setup ---

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('[data-view]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const view = e.target.dataset.view || e.target.closest('[data-view]').dataset.view;
            showView(view);
        });
    });

    // Search and filters
    document.getElementById('search-input').addEventListener('input', () => {
        currentPage = 1; // Reset pagination on search
        displayNotices();
    });
    document.getElementById('filter-toggle').addEventListener('click', () => {
        document.getElementById('filters').classList.toggle('active');
    });
    document.getElementById('category-filter').addEventListener('change', () => {
        currentPage = 1; // Reset pagination on filter change
        displayNotices();
    });
    document.getElementById('priority-filter').addEventListener('change', () => {
        currentPage = 1; // Reset pagination on filter change
        displayNotices();
    });
    document.getElementById('sort-filter').addEventListener('change', () => {
        currentPage = 1; // Reset pagination on sort change
        displayNotices();
    });
    document.getElementById('clear-filters').addEventListener('click', () => {
        document.getElementById('category-filter').value = '';
        document.getElementById('priority-filter').value = '';
        document.getElementById('sort-filter').value = 'date-desc';
        document.getElementById('search-input').value = '';
        currentPage = 1; // Reset pagination
        displayNotices();
    });
    document.getElementById('load-more-btn').addEventListener('click', loadMoreNotices);

    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    // Form handling
    document.getElementById('notice-form').addEventListener('submit', handleFormSubmit);
    document.getElementById('image-upload').addEventListener('change', handleImageUpload);

    // Modal handling
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('favorite-btn').addEventListener('click', () => {
        if (currentNotice) {
            toggleFavorite(currentNotice.id);
        }
    });
    // Share button dropdown toggle
    document.getElementById('share-btn').addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent modal close
        e.currentTarget.closest('.dropdown').classList.toggle('active');
    });

    // Social Share buttons
    document.getElementById('share-twitter').addEventListener('click', (e) => {
        e.preventDefault();
        if (currentNotice) {
            const text = encodeURIComponent(`${currentNotice.title} - ${stripHtml(currentNotice.content).substring(0, 100)}...`);
            const url = encodeURIComponent(window.location.href); // Or a specific notice URL if implemented
            window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
            showToast('Opening Twitter...', 'info');
        }
    });
    document.getElementById('share-facebook').addEventListener('click', (e) => {
        e.preventDefault();
        if (currentNotice) {
            const url = encodeURIComponent(window.location.href); // Or a specific notice URL if implemented
            window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
            showToast('Opening Facebook...', 'info');
        }
    });
    document.getElementById('share-clipboard').addEventListener('click', (e) => {
        e.preventDefault();
        if (currentNotice) {
            const shareText = `${currentNotice.title}\n\n${stripHtml(currentNotice.content)}${currentNotice.location ? `\n\nLocation: ${currentNotice.location}` : ''}\n\nCheck it out on the Community Notice Board!`;
            navigator.clipboard.writeText(shareText).then(() => {
                showToast('Notice link copied to clipboard!', 'success');
            }).catch(err => {
                console.error('Failed to copy: ', err);
                showToast('Failed to copy to clipboard.', 'error');
            });
        }
    });


    document.getElementById('edit-btn').addEventListener('click', () => {
        if (currentNotice) {
            editNotice(currentNotice.id);
        }
    });
    document.getElementById('delete-btn').addEventListener('click', () => {
        if (currentNotice) {
            deleteNotice(currentNotice.id);
        }
    });

    // Character counting for title
    document.getElementById('title').addEventListener('input', (e) => {
        document.getElementById('title-count').textContent = e.target.value.length;
    });

    // Close modal on outside click (and share dropdown)
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeModal();
        }
        const dropdowns = document.querySelectorAll('.dropdown-content');
        dropdowns.forEach(dropdown => {
            const parentDropdown = dropdown.closest('.dropdown');
            if (!parentDropdown.contains(e.target)) {
                parentDropdown.classList.remove('active');
            }
        });
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });

    // Login Modal
    document.getElementById('login-modal-close').addEventListener('click', closeModal);
    document.getElementById('login-form').addEventListener('submit', handleLogin);
}

// --- Initialize app ---

function init() {
    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    document.getElementById('theme-toggle').innerHTML = savedTheme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';

    // Set up event listeners
    setupEventListeners();
    setupRichTextEditor(); // Initialize rich text editor

    // Update auth UI based on stored user
    updateAuthUI();

    // Load and display notices
    displayNotices();
    updateStatistics();
}

// Start the app
init();