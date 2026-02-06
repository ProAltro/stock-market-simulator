/**
 * Template Loader - Loads HTML partials into the page
 * Works with Alpine.js by loading templates before Alpine initializes
 */

const TEMPLATE_BASE = './';

/**
 * Load an HTML template file and inject it into the DOM
 * @param {string} path - Path to the HTML file
 * @param {string} targetSelector - CSS selector for the target container
 * @param {string} position - 'replace', 'append', or 'prepend'
 */
async function loadTemplate(path, targetSelector, position = 'replace') {
  try {
    const response = await fetch(`${TEMPLATE_BASE}${path}`);
    if (!response.ok) {
      console.error(`Failed to load template: ${path}`);
      return false;
    }
    
    const html = await response.text();
    const target = document.querySelector(targetSelector);
    
    if (!target) {
      console.error(`Target element not found: ${targetSelector}`);
      return false;
    }
    
    switch (position) {
      case 'append':
        target.insertAdjacentHTML('beforeend', html);
        break;
      case 'prepend':
        target.insertAdjacentHTML('afterbegin', html);
        break;
      case 'replace':
      default:
        target.innerHTML = html;
        break;
    }
    
    return true;
  } catch (error) {
    console.error(`Error loading template ${path}:`, error);
    return false;
  }
}

/**
 * Load multiple templates in sequence
 * @param {Array} templates - Array of {path, target, position} objects
 */
async function loadTemplates(templates) {
  for (const template of templates) {
    await loadTemplate(template.path, template.target, template.position || 'replace');
  }
}

/**
 * Initialize the application by loading all templates
 * This should be called before Alpine.js initializes
 */
async function initTemplates() {
  // Load components
  await loadTemplate('components/sidebar.html', '#sidebar-container', 'replace');
  await loadTemplate('components/auth-modal.html', '#auth-container', 'replace');
  
  // Load pages into the main content area
  const pages = [
    'pages/dashboard.html',
    'pages/trade.html',
    'pages/portfolio.html',
    'pages/leaderboard.html',
    'pages/backtest.html',
    'pages/profile.html'
  ];
  
  for (const page of pages) {
    await loadTemplate(page, '#pages-container', 'append');
  }
  
  console.log('Templates loaded');
}

export { loadTemplate, loadTemplates, initTemplates };
