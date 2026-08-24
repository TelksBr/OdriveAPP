interface FlagProps {
  size?: number;
  className?: string;
}

export function FlagBR({ size = 18, className = '' }: FlagProps) {
  return (
    <svg
      width={size}
      height={Math.round((size * 5) / 7)}
      viewBox="0 0 700 500"
      className={`flag-icon flag-br ${className}`}
      style={{
        borderRadius: '2px',
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        boxShadow: '0 0 1px rgba(0, 0, 0, 0.4)',
      }}
      aria-hidden="true"
    >
      <rect width="700" height="500" fill="#009c3b" />
      <polygon points="350,42 658,250 350,458 42,250" fill="#ffdf00" />
      <circle cx="350" cy="250" r="126" fill="#002776" />
      <path
        d="M 234 250 A 126 126 0 0 1 486 250 A 140 140 0 0 0 234 250"
        fill="#ffffff"
      />
    </svg>
  );
}

export function FlagUS({ size = 18, className = '' }: FlagProps) {
  return (
    <svg
      width={size}
      height={Math.round((size * 5) / 7)}
      viewBox="0 0 741 500"
      className={`flag-icon flag-us ${className}`}
      style={{
        borderRadius: '2px',
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        boxShadow: '0 0 1px rgba(0, 0, 0, 0.4)',
      }}
      aria-hidden="true"
    >
      <rect width="741" height="500" fill="#b22234" />
      <path
        d="M0,38.46H741M0,115.38H741M0,192.3H741M0,269.22H741M0,346.14H741M0,423.06H741"
        stroke="#ffffff"
        strokeWidth="38.46"
      />
      <rect width="296.4" height="269.22" fill="#3c3b6e" />
      <g fill="#ffffff">
        <circle cx="50" cy="45" r="10" />
        <circle cx="100" cy="45" r="10" />
        <circle cx="150" cy="45" r="10" />
        <circle cx="200" cy="45" r="10" />
        <circle cx="250" cy="45" r="10" />
        <circle cx="75" cy="90" r="10" />
        <circle cx="125" cy="90" r="10" />
        <circle cx="175" cy="90" r="10" />
        <circle cx="225" cy="90" r="10" />
        <circle cx="50" cy="135" r="10" />
        <circle cx="100" cy="135" r="10" />
        <circle cx="150" cy="135" r="10" />
        <circle cx="200" cy="135" r="10" />
        <circle cx="250" cy="135" r="10" />
        <circle cx="75" cy="180" r="10" />
        <circle cx="125" cy="180" r="10" />
        <circle cx="175" cy="180" r="10" />
        <circle cx="225" cy="180" r="10" />
        <circle cx="50" cy="225" r="10" />
        <circle cx="100" cy="225" r="10" />
        <circle cx="150" cy="225" r="10" />
        <circle cx="200" cy="225" r="10" />
        <circle cx="250" cy="225" r="10" />
      </g>
    </svg>
  );
}
