'use client';
import {useRouter} from 'next/navigation';
import {LoginPanel} from './LoginPanel';
export function ShippingPrintSignIn(){const router=useRouter();return <LoginPanel adminMode onSignedIn={async()=>{router.refresh();}}/>;}
