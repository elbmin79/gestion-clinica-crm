import Image from 'next/image';

export default function AuthBrand({ className = '', light = false }) {
  const classes = ['auth-brand', className].filter(Boolean).join(' ');
  return <div className={classes}><Image className="auth-brand-logo" src={light ? '/elixirclinic-logo-dark.png' : '/elixirclinic-logo.png'} alt="Elixir Clinic · Dra. Iliana Verdugo" width={1374} height={1145} priority /></div>;
}
