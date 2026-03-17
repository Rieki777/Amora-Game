import Layout from "@/components/Layout";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { 
  Home, 
  ArrowRight, 
  Calendar,
  MapPin,
  TreePine,
  Mountain,
  Droplets,
  Sun
} from "lucide-react";

const housingTypes = [
  {
    title: "Tiny Home",
    size: "200-400 sq ft",
    price: "$80,000 - $150,000",
    description: "Efficient, sustainable living spaces perfect for individuals or couples seeking simplicity.",
    features: ["Off-grid capable", "Eco-friendly materials", "Community garden access"],
  },
  {
    title: "Casita",
    size: "400-800 sq ft",
    price: "$150,000 - $250,000",
    description: "Cozy homes with room to breathe, ideal for small families or those wanting extra space.",
    features: ["Private outdoor space", "Full kitchen", "Covered patio"],
  },
  {
    title: "Family Home",
    size: "800-1,500 sq ft",
    price: "$250,000 - $450,000",
    description: "Spacious homes designed for families, with multiple bedrooms and living areas.",
    features: ["Multiple bedrooms", "Large kitchen", "Private garden"],
  },
  {
    title: "Luxury Villa",
    size: "1,500+ sq ft",
    price: "$450,000+",
    description: "Premium homes with exceptional finishes, views, and amenities for discerning residents.",
    features: ["Premium finishes", "Panoramic views", "Private pool option"],
  },
];

const landFeatures = [
  {
    title: "Mountain Views",
    description: "Many lots offer stunning views of the surrounding mountains and valleys.",
    icon: Mountain,
  },
  {
    title: "Water Access",
    description: "Natural springs and streams throughout the property provide clean water.",
    icon: Droplets,
  },
  {
    title: "Mature Forest",
    description: "Existing forest provides shade, privacy, and connection to nature.",
    icon: TreePine,
  },
  {
    title: "Solar Exposure",
    description: "Lots are positioned for optimal solar energy and natural lighting.",
    icon: Sun,
  },
];

export default function Housing() {
  return (
    <Layout>
      {/* Hero */}
      <section className="py-24 bg-teal text-white">
        <div className="container">
          <div className="max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Home className="w-16 h-16 mb-6 opacity-80" />
              <h1 className="font-display text-4xl md:text-6xl font-bold mb-6">
                Housing at Amora
              </h1>
              <p className="text-xl text-white/80 leading-relaxed">
                From tiny homes to luxury villas, find your perfect place in our 
                regenerative village. All homes are built with sustainable materials 
                and designed to harmonize with the land.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Land Features */}
      <section className="py-16 bg-aqua-light">
        <div className="container">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {landFeatures.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="text-center"
              >
                <div className="w-14 h-14 rounded-full bg-teal/10 flex items-center justify-center mx-auto mb-4">
                  <feature.icon className="w-7 h-7 text-teal" />
                </div>
                <h3 className="font-display text-lg font-semibold text-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Housing Types */}
      <section className="py-20 bg-background">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
              Housing Options
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              We're building 10 show homes of various sizes and styles. 
              Prices are estimates and will vary based on finishes and location.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {housingTypes.map((type, index) => (
              <motion.div
                key={type.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-card p-8 rounded-2xl shadow-sm"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-display text-2xl font-bold text-foreground">
                      {type.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">{type.size}</p>
                  </div>
                  <span className="px-3 py-1 bg-teal/10 text-teal text-sm font-medium rounded-lg">
                    {type.price}
                  </span>
                </div>
                <p className="text-muted-foreground mb-4">
                  {type.description}
                </p>
                <ul className="space-y-2">
                  {type.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-teal" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Land Share Info */}
      <section className="py-20 bg-teal/10">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center">
            <MapPin className="w-12 h-12 text-teal mx-auto mb-6" />
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
              Land Share Agreements
            </h2>
            <p className="text-muted-foreground mb-6">
              At Amora, you don't purchase land outright—you acquire a Land Share Agreement 
              that gives you long-term access to your lot. This unique structure:
            </p>
            <div className="grid sm:grid-cols-3 gap-6 text-left mb-8">
              <div className="bg-card p-6 rounded-xl">
                <h3 className="font-semibold text-foreground mb-2">Renewable</h3>
                <p className="text-sm text-muted-foreground">
                  Your agreement can be renewed, providing long-term security for your family.
                </p>
              </div>
              <div className="bg-card p-6 rounded-xl">
                <h3 className="font-semibold text-foreground mb-2">Transferable</h3>
                <p className="text-sm text-muted-foreground">
                  Pass your land share to your children tax-free, keeping it in the family.
                </p>
              </div>
              <div className="bg-card p-6 rounded-xl">
                <h3 className="font-semibold text-foreground mb-2">Community Owned</h3>
                <p className="text-sm text-muted-foreground">
                  The land remains in community ownership, ensuring our values are preserved.
                </p>
              </div>
            </div>
            <Link
              href="/resident"
              className="inline-flex items-center gap-2 px-6 py-3 bg-teal text-white rounded-lg font-semibold hover:opacity-90 transition-opacity"
            >
              Learn About Residency
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-background">
        <div className="container">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
              Interested in Housing?
            </h2>
            <p className="text-muted-foreground mb-8">
              Join a community call to learn about available lots, pricing, 
              and the process for becoming a resident.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <a
                href="https://amora.cr/event/discover-amora-webinar-qa/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-4 bg-teal text-white rounded-lg font-semibold hover:opacity-90 transition-opacity flex items-center gap-2"
              >
                <Calendar className="w-5 h-5" />
                Join Community Call
              </a>
              <Link
                href="/resident"
                className="px-8 py-4 bg-muted text-foreground rounded-lg font-semibold hover:bg-muted/80 transition-colors"
              >
                Resident Journey
              </Link>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
