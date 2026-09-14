export function Icon({ name }) {
  const paths = {
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 5 5" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    plus: <path d="M12 4v16M4 12h16" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    file: (
      <>
        <path d="M6 3h8l4 4v14H6zM14 3v5h4" />
      </>
    ),
    message: (
      <path d="M20 11a8 8 0 0 1-8 8H5l-3 3v-9a9 9 0 1 1 18-2Z" />
    ),
    camera: (
      <>
        <path d="M3 7h5l2-3h4l2 3h5v13H3z" />
        <circle cx="12" cy="13" r="4" />
      </>
    ),
    gif: (
      <path d="M6 8h4v8H6zm6 0h2v3h3v2h-3v3h-2zM4 4h16v16H4z" />
    ),
    'arrow-left': <path d="M5 12h14M5 12l6-6M5 12l6 6" />,
    send: <path d="M12 19V5m-6 6 6-6 6 6" />,
  }
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      {paths[name] || paths.file}
    </svg>
  )
}
