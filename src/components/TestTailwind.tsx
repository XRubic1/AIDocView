// Simple test component to verify Tailwind is working
export default function TestTailwind() {
  return (
    <div className="p-8 bg-blue-500 text-white rounded-lg">
      <h1 className="text-2xl font-bold mb-4">Tailwind CSS Test</h1>
      <p className="text-lg">If you see this with a blue background and white text, Tailwind is working!</p>
      <div className="mt-4 p-4 bg-white text-black rounded">
        <p>This should have a white background with black text.</p>
      </div>
    </div>
  )
}


