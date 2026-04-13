export function renderSidebarShell(): string {
  return `
    <aside class="http-sidebar">
      <div class="sidebar-header">
        <div class="sidebar-title-wrap">
          <span class="sidebar-caption">WORKSPACE</span>
          <h1>HTTP Client</h1>
        </div>
        <div class="sidebar-header-actions">
          <button class="ghost-button sidebar-action-button" data-action="create-collection" type="button">新建集合</button>
          <button class="ghost-button sidebar-action-button" data-action="create-request" type="button">新建请求</button>
        </div>
      </div>
      <section class="sidebar-section">
        <div class="section-title-row">
          <div>
            <span class="section-kicker">Collections</span>
            <h3>集合</h3>
          </div>
        </div>
        <div id="collection-tree" class="sidebar-list"></div>
      </section>
      <section class="sidebar-section">
        <div class="section-title-row">
          <div>
            <span class="section-kicker">Favorites</span>
            <h3>收藏</h3>
          </div>
        </div>
        <div id="favorite-list" class="sidebar-list"></div>
      </section>
      <section class="sidebar-section">
        <div class="section-title-row">
          <div>
            <span class="section-kicker">History</span>
            <h3>历史</h3>
          </div>
        </div>
        <div id="history-list" class="sidebar-list history-list"></div>
      </section>
    </aside>
  `;
}
