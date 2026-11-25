const paths = {
  logo: 'M2 17 12 3l10 14H2Zm4 0v4m12-4v4M12 3l4 14',
  cube: 'm12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9 8-4.5M12 12 4 7.5M12 12v9',
  layers: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5m-5-9h.01',
  type: 'M4 7V4h16v3m-8-3v16m-5 0h10',
  reset: 'M3 12a9 9 0 1 1 2 5m-2 1v-6h6',
  undo: 'm8 7-5 5 5 5m-5-5h11a5 5 0 0 1 5 5',
  redo: 'm16 7 5 5-5 5m5-5H10a5 5 0 0 0-5 5',
  cart: 'M3 3h2l2.5 12h11l2-8H6m3 13h.01m9 0h.01',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16m-10 4v6m4-6v6M8 7V4h8v3M6 7l1 13h10l1-13',
  up: 'm6 15 6-6 6 6',
  down: 'm6 9 6 6 6-6',
  palette: 'M12 3a9 9 0 1 0 0 18h1.4a1.6 1.6 0 0 0 1-2.8 1.6 1.6 0 0 1 1.1-2.8H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3ZM7.4 9h.01m4.3-2.1h.01m4.5 1.7h.01M7 13.7h.01',
}
export default function Icon({ name, size = 19 }: { name: keyof typeof paths; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>
}
