import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import axiosInstance from "../../utils/axiosInstance"; // Adjust path as needed
import Header from "../../components/header";
import Footer from "../../components/footer";

const Products = () => {
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hoveredProductId, setHoveredProductId] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState({});
  const [selectedCategory, setSelectedCategory] = useState(
    searchParams.get("category") || null
  );

  // Handle category selection from Header component
  const handleCategorySelect = (categoryId) => {
    setSelectedCategory(categoryId);
    setCurrentPage(1); // Reset to first page when category changes
  };

  // Fetch products from API based on category and page
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        
        // Build the API URL with query parameters
        let url = `/products/get?page=${currentPage}&limit=8`;
        
        // Add category filter if a category is selected
        if (selectedCategory && selectedCategory !== "home") {
          url += `&category=${selectedCategory}`;
        }
        
        const response = await axiosInstance.get(url);
        setProducts(response.data.products);
        setTotalPages(response.data.totalPages);

        // Initialize selectedVariant with first variant of each product
        const initialVariantSelection = {};
        response.data.products.forEach((product) => {
          if (product.variants && product.variants.length > 0) {
            initialVariantSelection[product._id] = product.variants[0]._id;
          }
        });
        setSelectedVariant(initialVariantSelection);

        setLoading(false);
      } catch (err) {
        console.error("Error fetching products:", err);
        setError("Failed to load products. Please try again later.");
        setLoading(false);
      }
    };

    fetchProducts();
  }, [currentPage, selectedCategory]);

  // Update category from URL params when component mounts or URL changes
  useEffect(() => {
    const categoryFromUrl = searchParams.get("category");
    if (categoryFromUrl) {
      setSelectedCategory(categoryFromUrl);
    }
  }, [searchParams]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo(0, 0);
  };

  const handleProductMouseEnter = (id) => {
    setHoveredProductId(id);
  };

  const handleProductMouseLeave = () => {
    setHoveredProductId(null);
  };

  const handleVariantChange = (productId, variantId) => {
    setSelectedVariant((prev) => ({
      ...prev,
      [productId]: variantId,
    }));
  };

  // Get lowest price from all variants with sizes
  const getLowestPrice = (variants) => {
    let lowestPrice = Infinity;
    let discountPrice = null;

    variants.forEach((variant) => {
      if (variant.sizes && variant.sizes.length > 0) {
        variant.sizes.forEach((size) => {
          if (size.price < lowestPrice) {
            lowestPrice = size.price;
            discountPrice = size.discountPrice;
          }
        });
      }
    });

    if (lowestPrice === Infinity)
      return { price: "Price not available", discountPrice: null };
    return {
      price: `Rs. ${lowestPrice.toFixed(2)}`,
      discountPrice: discountPrice ? `Rs. ${discountPrice.toFixed(2)}` : null,
    };
  };

  // Get currently selected variant object
  const getSelectedVariant = (product) => {
    const variantId = selectedVariant[product._id];
    return (
      product.variants.find((v) => v._id === variantId) || product.variants[0]
    );
  };

  // Get sizes for selected variant
  const getAvailableSizes = (product) => {
    const variant = getSelectedVariant(product);
    return variant?.sizes || [];
  };

  if (loading)
    return (
      <div className="container mx-auto px-4 pt-32 pb-8 flex justify-center items-center min-h-screen">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
          <p className="mt-2">Loading products...</p>
        </div>
      </div>
    );

  if (error)
    return (
      <div className="container mx-auto px-4 pt-32 pb-8 flex justify-center items-center min-h-screen">
        <div className="text-center">
          <p className="text-red-500">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 bg-black text-white px-4 py-2"
          >
            Try Again
          </button>
        </div>
      </div>
    );

  return (
    <>
      <Header onCategorySelect={handleCategorySelect} />
      <div className="container max-w-screen mx-auto px-4 pt-32 pb-8">
        {products.length === 0 ? (
          <div className="text-center py-16">
            <h2 className="text-xl font-medium">No products found</h2>
            <p className="text-gray-600 mt-2">
              {selectedCategory
                ? "No products available in this category."
                : "No products available."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {products.map((product) => {
              const currentVariant = getSelectedVariant(product);
              const priceInfo = getLowestPrice(product.variants);

              return (
                <div
                  key={product._id}
                  className="relative w-full"
                  onMouseEnter={() => handleProductMouseEnter(product._id)}
                  onMouseLeave={handleProductMouseLeave}
                >
                  {/* New badge */}
                  {new Date(product.createdAt) >
                    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) && (
                    <span className="absolute top-2 left-2 bg-green-500 text-white px-3 py-1 text-xs z-10">
                      New in
                    </span>
                  )}

                  <div className="relative cursor-pointer group">
                    <a href={`/detail/${product._id}`}>
                      <img
                        src={
                          currentVariant?.mainImage || "/placeholder-product.jpg"
                        }
                        alt={product.name}
                        className="w-full h-[350px] md:h-[450px] lg:h-[500px] object-cover"
                      />
                    </a>

                    {/* Navigation arrows on hover */}
                    {hoveredProductId === product._id && (
                      <>
                        <button
                          className="absolute left-2 top-1/2 -translate-y-1/2 bg-white bg-opacity-80 rounded-full p-2 shadow-md z-20"
                          onClick={(e) => {
                            e.stopPropagation();
                            const currentIndex = product.variants.findIndex(
                              (v) => v._id === selectedVariant[product._id]
                            );
                            const prevIndex =
                              (currentIndex - 1 + product.variants.length) %
                              product.variants.length;
                            handleVariantChange(
                              product._id,
                              product.variants[prevIndex]._id
                            );
                          }}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="w-5 h-5"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M15.75 19.5L8.25 12l7.5-7.5"
                            />
                          </svg>
                        </button>
                        <button
                          className="absolute right-2 top-1/2 -translate-y-1/2 bg-white bg-opacity-80 rounded-full p-2 shadow-md z-20"
                          onClick={(e) => {
                            e.stopPropagation();
                            const currentIndex = product.variants.findIndex(
                              (v) => v._id === selectedVariant[product._id]
                            );
                            const nextIndex =
                              (currentIndex + 1) % product.variants.length;
                            handleVariantChange(
                              product._id,
                              product.variants[nextIndex]._id
                            );
                          }}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="w-5 h-5"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M8.25 4.5l7.5 7.5-7.5 7.5"
                            />
                          </svg>
                        </button>
                      </>
                    )}

                    {/* Color variant selector */}
                    {hoveredProductId === product._id &&
                      product.variants.length > 1 && (
                        <div className="absolute bottom-16 left-0 right-0 bg-white p-2 transition-opacity duration-300 opacity-100">
                          <div className="flex flex-wrap justify-center gap-2">
                            {product.variants.map((variant) => (
                              <button
                                key={variant._id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleVariantChange(product._id, variant._id);
                                }}
                                className={`w-6 h-6 rounded-full border ${
                                  selectedVariant[product._id] === variant._id
                                    ? "border-black border-2"
                                    : "border-gray-300"
                                }`}
                                style={{
                                  backgroundImage: `url(${variant.colorImage})`,
                                  backgroundSize: "cover",
                                  backgroundPosition: "center",
                                }}
                                aria-label={`Select ${variant.color} color`}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                    {/* Quick Buy button */}
                    <div
                      className={`absolute bottom-0 left-0 right-0 bg-white p-2 transition-opacity duration-300 ${
                        hoveredProductId === product._id
                          ? "opacity-100"
                          : "opacity-0"
                      }`}
                    >
                      <button className="w-full bg-white border border-gray-300 text-gray-700 py-3 font-medium uppercase">
                        QUICK BUY
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <h3 className="text-sm font-medium line-clamp-2">
                      {product.name}
                    </h3>
                    <div className="flex items-center gap-2">
                      {priceInfo.discountPrice ? (
                        <>
                          <p className="text-sm font-medium">
                            {priceInfo.discountPrice}
                          </p>
                          <p className="text-sm text-gray-500 line-through">
                            {priceInfo.price}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm">{priceInfo.price}</p>
                      )}
                    </div>

                    <p className="text-sm text-gray-500">
                      {currentVariant?.color || "Various colors"}
                      {getAvailableSizes(product).length > 0 &&
                        ` • ${getAvailableSizes(product).length} sizes`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center space-x-2 mt-8">
            {Array.from({ length: totalPages }, (_, index) => (
              <button
                key={index + 1}
                onClick={() => handlePageChange(index + 1)}
                className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
                  currentPage === index + 1
                    ? "bg-black text-white"
                    : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                }`}
              >
                {index + 1}
              </button>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </>
  );
};

export default Products;