import { useEffect, useRef, useState } from 'react';

export default function BackToTopButton() {
  const scrollRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const container = document.querySelector('.main-content');
    scrollRef.current = container;
    if (!container) return undefined;

    const updateVisibility = () => {
      setVisible(container.scrollTop > 360);
    };

    updateVisibility();
    container.addEventListener('scroll', updateVisibility, { passive: true });
    return () => {
      container.removeEventListener('scroll', updateVisibility);
    };
  }, []);

  const handleClick = () => {
    const container = scrollRef.current || document.querySelector('.main-content');
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <button
      type="button"
      className={`back-to-top${visible ? ' is-visible' : ''}`}
      onClick={handleClick}
      aria-label="回到页面顶部"
      title="回到顶部"
    >
      <span aria-hidden="true" className="back-to-top-icon" />
    </button>
  );
}
