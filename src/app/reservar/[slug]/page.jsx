import PublicBooking from '../../public-booking';
import {notFound} from 'next/navigation';
export const metadata={title:'Solicitar una cita',robots:{index:false,follow:false}};
export default async function BookingPage({params}){
  const {slug}=await params;
  if(!/^[a-z0-9][a-z0-9-]{2,59}$/.test(slug))notFound();
  return <PublicBooking slug={slug}/>;
}
