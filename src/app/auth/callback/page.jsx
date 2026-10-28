import AuthCallbackClient from './callback-client';

function safeNext(value) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/';
}

export default async function AuthCallbackPage({ searchParams }) {
  const params = await searchParams;
  return <AuthCallbackClient next={safeNext(params?.next)} />;
}
