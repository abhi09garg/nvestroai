import React, { useEffect, useState } from "react";

export default function Advisor() {
  const [message, setMessage] = useState("Loading...");

  useEffect(() => {
    fetch("http://localhost:4000/api/advisor")
      .then(res => res.json())
      .then(data => setMessage(data.message))
      .catch(err => setMessage("Error connecting to backend"));
  }, []);

  return (
    <div className="text-center">
      <h2 className="text-2xl font-semibold mb-4">Advisor Page</h2>
      <p className="text-gray-700">{message}</p>
    </div>
  );
}
