import React from 'react';

// These inline SVGs follow the icon set in index1.html, without external font or CDN dependencies.
const paths = {
  home: 'M3 10l9-7 9 7M5 9v12h5v-7h4v7h5V9',
  search: 'M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16ZM17 17l4 4',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  listings: 'M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1',
  chat: 'M21 11a9 9 0 0 1-9 9H4l-3 2 2-6a9 9 0 1 1 18-5ZM7 10h10M7 14h6',
  user: 'M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  plus: 'M12 4v16M4 12h16',
  menu: 'M3 6h18M3 12h18M3 18h18',
  building: 'M5 21V4l7-2 7 2v17M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1M10 21v-3h4v3',
  projects: 'M3 21V8l6-3v16M9 10h12v11M6 11h.01M6 15h.01M13 13h.01M17 13h.01M13 17h.01M17 17h.01M9 21h12',
  land: 'm3 17 9-5 9 5-9 5-9-5Zm0-5 9-5 9 5M12 12V3m0 0 5 2-5 2',
  house: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z',
  auction: 'm14 4 6 6M5 20l9-9m-2-9 8 8-4 4-8-8 4-4ZM3 21h18',
  key: 'M8 14a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm4-1 8 8m-4-4 3-3m-6 0 3-3',
  store: 'M3 9h18l-2-6H5L3 9Zm1 0v12h16V9M9 21v-7h6v7M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0',
  pin: 'M19 9c0 5-7 12-7 12S5 14 5 9a7 7 0 1 1 14 0ZM12 9a2 2 0 1 0 0 .01',
  map: 'm3 5 6-2 6 3 6-3v16l-6 3-6-3-6 2V5Zm6-2v16m6-13v16',
  filter: 'M3 5h18M6 12h12M9 19h6',
  photo: 'M3 4h18v16H3zM8 9h.01M3 17l5-5 4 4 4-6 5 7',
  check: 'm4 12 5 5L20 6',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2',
  phone: 'M5 3h4l2 5-3 2a16 16 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A18 18 0 0 1 3 5a2 2 0 0 1 2-2Z',
  shield: 'm12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Zm-4 10 3 3 5-6',
  settings: 'm9 3-1 3-3 1-2 4 2 2v4l4 2 3-1 3 1 4-2v-4l2-2-2-4-3-1-1-3H9Zm3 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  file: 'M14 2H5v20h14V7l-5-5Zm0 0v5h5M8 12h8m-8 4h8',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm-2.9-13a3 3 0 0 1 5.8 1c0 2-2.9 2.5-2.9 4.5m.01 3h.01',
  share: 'M18 8a3 3 0 1 0-2.8-4.1L8.7 7.7a3 3 0 1 0 0 4.6l6.5 3.8A3 3 0 1 0 16 14l-6.5-3.8a3 3 0 0 0 0-.4L16 6a3 3 0 0 0 2 2Z',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
};

export default function Icon({ name, size = 21, className = '', filled = false }) {
  return <svg className={`ui-icon ${className}`} style={{width:size,height:size}} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name] || paths.home}/></svg>;
}
