export const routerModule = {
    initRouter() {
        // Handle initial load
        this.handleRoute();

        // Listen for back/forward button navigation
        window.addEventListener('popstate', () => {
            this.handleRoute();
        });
    },

    handleRoute() {
        // Get path, remove leading slash
        const path = window.location.pathname.substring(1) || 'dashboard';
        
        // Define valid routes to prevent arbitrary page loading
        const validRoutes = [
            'dashboard', 
            'trade', 
            'portfolio', 
            'leaderboard', 
            'backtest', 
            'profile',
            'docs'
        ];

        if (validRoutes.includes(path)) {
            this.currentPage = path;
            
            // Trigger specific page actions if needed
            if (path === 'profile' && this.fetchProfile) {
                this.fetchProfile();
            }
        } else {
            // Invalid route or root -> default to dashboard
            // If it's truly unknown, we might want 404, but for now dashboard is safe
            this.navigateTo('dashboard', true);
        }
    },

    navigateTo(page, replace = false) {
        if (this.currentPage === page) return;

        this.currentPage = page;
        
        const url = `/${page}`;
        if (replace) {
            history.replaceState(null, '', url);
        } else {
            history.pushState(null, '', url);
        }

        // Trigger actions
        if (page === 'profile' && this.fetchProfile) {
            this.fetchProfile();
        }
    }
};
