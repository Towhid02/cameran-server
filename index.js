const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const app = express();
const port = process.env.PORT || 5000;
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// middleware

app.use(
  cors({
      origin: [
        'http://localhost:5173',
      ],
      credentials: true,
  }),
)
app.use(cors());
app.use(express.json()); 



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.0klimfk.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {

    const contestsCollection = client.db('photography-contestDB').collection('contests');
    const featuresCollection = client.db('photography-contestDB').collection('features');
    const galleryCollection = client.db('photography-contestDB').collection('gallery');
    const cartCollection = client.db('photography-contestDB').collection("carts");
    const userCollection = client.db('photography-contestDB').collection("users");
    const paymentCollection = client.db('photography-contestDB').collection("payments");


     // jwt related api
     app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    })

     // middlewares 
     const verifyToken = (req, res, next) => {
      // console.log('inside verify token', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
      })
    }

    // use verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }
    
    // users related api
    app.post('/users', async (req, res) => {
      const user = req.body;
      // insert email if user doesn't exists: 
      // you can do this many ways (1. email unique, 2. upsert 3. simple checking)
      const query = { email: user.email }
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'user already exists', insertedId: null })
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get('/users',   async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get('/users/admin/:email', verifyToken,  async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    })

    app.patch('/users/admin/:id', verifyToken, verifyAdmin,  async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })


    app.delete('/users/:id', verifyToken, verifyAdmin,  async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })

    // gallery
    app.get('/gallery', async (req, res) => {
      const cursor = galleryCollection.find();
      const result = await cursor.toArray();
      res.send(result);
      })

    // carts collection
    app.get('/carts', async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });
    app.post('/carts', async (req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    });
    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    })

    // Contests
    app.get('/contests', async (req, res) => {
      const cursor = contestsCollection.find();
      const result = await cursor.toArray();
      res.send(result);
      })

      app.get('/contests/:id', async (req, res) => {
        const id = req.params.id;
        const query = {_id: new ObjectId(id)}
        const result = await contestsCollection.findOne(query);
        res.send(result);
        })
        app.post('/contests', verifyToken, verifyAdmin,  async (req, res) => {
          const item = req.body;
          const result = await contestsCollection.insertOne(item);
          res.send(result);
        });
    
        app.patch('/contests/:id', async (req, res) => {
          const item = req.body;
          const id = req.params.id;
          const filter = { _id: new ObjectId(id) }
          const updatedDoc = {
            $set: {
              name: item.name,
              category: item.category,
              price: item.price,
              contest: item.contest,
              image: item.image
            }
          }
          const result = await contestsCollection.updateOne(filter, updatedDoc)
          res.send(result);
        })
    
        app.delete('/contests/:id', verifyToken, verifyAdmin, async (req, res) => {
          const id = req.params.id;
          const query = { _id: new ObjectId(id) };
          const result = await contestsCollection.deleteOne(query);
          res.send(result);
        })
    
    // Features
    app.get('/features', async (req, res) => {
      const cursor = featuresCollection.find();
      const result = await cursor.toArray();
      res.send(result);
      })

      // payment intent
     app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      console.log(amount, 'amount inside the intent')

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });

      res.send({
        clientSecret: paymentIntent.client_secret
      })
    });  

    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);

      //  carefully delete each item from the cart
      console.log('payment info', payment);
      const query = {
        _id: {
          $in: payment.cartIds.map(id => new ObjectId(id))
        }
      };
      const deleteResult = await cartCollection.deleteMany(query);

      res.send({ paymentResult, deleteResult });
    })

    app.get('/payments/:email', async (req, res) => {
      const query = { email: req.params.email }
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    })

     // stats or analytics
     app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const contestsItems = await contestsCollection.estimatedDocumentCount();
      const pay = await paymentCollection.estimatedDocumentCount();

   
      const result = await paymentCollection.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: '$price'
            }
          }
        }
      ]).toArray();

      const revenue = result.length > 0 ? result[0].totalRevenue : 0;

      res.send({
        users,
        contestsItems,
        pay,
        revenue
      })
    })
      

    // using aggregate pipeline
    app.get('/order-stats', async(req, res) =>{
      const result = await paymentCollection.aggregate([
        // {
        //   $unwind: '$menuItemIds'
        // },
        // {
        //   $lookup: {
        //     from: 'contests',
        //     localField: 'menuItemIds',
        //     foreignField: '_id',
        //     as: 'ContestsItems'
        //   }
        // },
        // {
        //   $unwind: '$contestsItems'
        // },
        // {
        //   $group: {
        //     _id: '$contestsItems.category',
        //     quantity:{ $sum: 1 },
        //     revenue: { $sum: '$contestsItems.price'} 
        //   }
        // },
        // {
        //   $project: {
        //     _id: 0,
        //     category: '$_id',
        //     quantity: '$quantity',
        //     revenue: '$revenue'
        //   }
        // }
      ]).toArray();

      res.send(result);

    })

    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Contest is running')
})

app.listen(port, () => {
    console.log(`Contest SERVER IS RUNNING ON PORT ${port}`);
})