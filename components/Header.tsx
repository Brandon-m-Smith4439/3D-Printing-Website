import { HeaderNav } from "@/components/HeaderNav";
import { currentCustomer } from "@/lib/customer-auth";
import { notificationsForCustomer } from "@/lib/customer-notifications";
import { getSiteContent } from "@/lib/site-content-store";

export async function Header() {
  const [site, customer] = await Promise.all([getSiteContent(), currentCustomer()]);
  const unreadCount = customer ? (await notificationsForCustomer(customer.id)).filter((item) => !item.readAt).length : 0;
  return (
    <header className="site-header">
      <HeaderNav
        site={{ name: site.name, logoImage: site.logoImage, etsyUrl: site.etsyUrl, whatnotUrl: site.whatnotUrl }}
        customer={customer ? { displayName: customer.displayName, unreadCount } : null}
      />
    </header>
  );
}
