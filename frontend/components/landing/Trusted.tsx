const industries = [
  { title: "Retail", icon: "🛍️" },
  { title: "Manufacturing", icon: "🏭" },
  { title: "Construction", icon: "🏗️" },
  { title: "Healthcare", icon: "🏥" },
  { title: "Logistics", icon: "🚚" },
  { title: "Restaurants", icon: "🍽️" },
];

export default function Trusted() {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <p className="text-sm font-semibold text-emerald-600 uppercase tracking-wide">
          Trusted by businesses of all sizes
        </p>
        <h2 className="mt-4 text-2xl sm:text-3xl font-bold text-neutral-900">
          Built for every industry
        </h2>
        <div className="mt-12 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {industries.map((ind) => (
            <div
              key={ind.title}
              className="group rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm hover:shadow-md hover:border-emerald-100 transition-all duration-300 cursor-default"
            >
              <div className="text-3xl mb-3">{ind.icon}</div>
              <p className="text-sm font-medium text-neutral-700 group-hover:text-emerald-600 transition-colors">
                {ind.title}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}