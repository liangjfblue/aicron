const STATUS_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'enabled', label: '已启用' },
  { key: 'disabled', label: '已停用' },
];

const ENGINE_FILTERS = [
  { key: 'all', label: '全部引擎' },
  { key: 'claude', label: 'Claude' },
  { key: 'codex', label: 'Codex' },
];

export default function Sidebar({ tasks = [], filters, onFilterChange }) {
  const statusCounts = {
    all: tasks.length,
    enabled: tasks.filter((t) => t.enabled).length,
    disabled: tasks.filter((t) => !t.enabled).length,
  };

  const engineCounts = {
    all: tasks.length,
    claude: tasks.filter((t) => t.engine === 'claude').length,
    codex: tasks.filter((t) => t.engine === 'codex').length,
  };

  const tags = [...new Set(tasks.flatMap((t) => t.tags || []))];
  const tagCounts = {};
  tags.forEach((tag) => {
    tagCounts[tag] = tasks.filter((t) => (t.tags || []).includes(tag)).length;
  });

  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-section-title">状态</div>
        {STATUS_FILTERS.map((f) => (
          <div
            key={f.key}
            className={`sidebar-item ${filters.status === f.key ? 'active' : ''}`}
            onClick={() => onFilterChange({ ...filters, status: f.key })}
          >
            <span>{f.label}</span>
            <span className="sidebar-item-count">{statusCounts[f.key]}</span>
          </div>
        ))}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-title">引擎</div>
        {ENGINE_FILTERS.map((f) => (
          <div
            key={f.key}
            className={`sidebar-item ${filters.engine === f.key ? 'active' : ''}`}
            onClick={() => onFilterChange({ ...filters, engine: f.key })}
          >
            <span>{f.label}</span>
            <span className="sidebar-item-count">{engineCounts[f.key]}</span>
          </div>
        ))}
      </div>

      {tags.length > 0 && (
        <div className="sidebar-section">
          <div className="sidebar-section-title">标签</div>
          {tags.map((tag) => (
            <div
              key={tag}
              className={`sidebar-item ${filters.tag === tag ? 'active' : ''}`}
              onClick={() =>
                onFilterChange({ ...filters, tag: filters.tag === tag ? null : tag })
              }
            >
              <span>{tag}</span>
              <span className="sidebar-item-count">{tagCounts[tag]}</span>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
