export function selectLatestRelease(releases) {
  if (!Array.isArray(releases)) return null;

  return releases
    .filter((release) => release && !release.draft && (release.tag_name || release.name))
    .sort((left, right) => {
      const leftTime = Date.parse(left.published_at || left.created_at || '');
      const rightTime = Date.parse(right.published_at || right.created_at || '');
      return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime);
    })[0] || null;
}
